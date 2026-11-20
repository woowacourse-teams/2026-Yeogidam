#!/usr/bin/env python3
"""Record extraction load-test measurements on the development Docker host."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
from urllib.request import urlopen


EXTRACTION_METRICS = (
    "media.extraction.active",
    "media.extraction.queue.size",
    "media.extraction.queue.wait",
    "media.extraction.queue.wait.dedicated.samples",
    "media.extraction.execution",
    "media.extraction.succeeded",
    "media.extraction.failed",
    "media.extraction.rejected",
)
OPTIONAL_METRICS = (
    "executor.pool.core",
    "executor.pool.max",
    "executor.queue.remaining",
    "hikaricp.connections.active",
    "hikaricp.connections.pending",
    "hikaricp.connections.acquire",
    "process.cpu.usage",
    "jvm.memory.used",
    "jvm.gc.pause",
    "jvm.threads.live",
    "tomcat.threads.busy",
)
QUEUE_WAIT_LOG = re.compile(r"LOAD_TEST_QUEUE_WAIT shortcode=([\w-]+) queueNs=(\d+)")
COLLECTION_ERRORS = (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True, help="Active backend container name or ID")
    parser.add_argument("--shortcode-prefix", required=True, help="Test shortcode prefix for this run")
    parser.add_argument("--output", type=Path, required=True, help="New directory for this run's measurements")
    parser.add_argument("--drain-timeout", type=int, default=300, help="Maximum seconds to wait for workers to finish")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Load generator command, preceded by --")
    args = parser.parse_args()
    if not re.fullmatch(r"ydlt_[A-Za-z0-9-]{1,24}_[A-Za-z0-9_-]*", args.shortcode_prefix):
        parser.error("--shortcode-prefix must start with a configured ydlt_<name>_ prefix")
    if args.drain_timeout < 1:
        parser.error("--drain-timeout must be positive")
    if len(args.command) < 2 or args.command[0] != "--":
        parser.error("provide a load generator command after --")
    return args


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def docker(*args, timeout=10):
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"docker {args[0]}: {result.stderr.strip()}")
    return result.stdout


def read_actuator(base, path):
    with urlopen(f"{base}/actuator/metrics{path}", timeout=3) as response:
        return json.load(response)


def sample(base, container, metric_names, output):
    sampled_at = utc_now()
    metrics = {}
    for name in metric_names:
        path = f"/{name}"
        if name.startswith("executor."):
            path += "?tag=name:mediaExtractionExecutor"
        elif name == "jvm.memory.used":
            path += "?tag=area:heap"
        metrics[name] = read_actuator(base, path)["measurements"]
    stats = json.loads(docker("stats", "--no-stream", "--format", "{{json .}}", container))
    output.write(json.dumps({"sampledAt": sampled_at, "actuator": metrics, "container": stats}) + "\n")
    output.flush()
    return metrics


def value(metrics, name, statistic):
    return next(item["value"] for item in metrics[name] if item["statistic"] == statistic)


def stop_command(command):
    try:
        os.killpg(command.pid, signal.SIGTERM)
        command.wait(timeout=5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        pass
    try:
        os.killpg(command.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    command.wait()


def record_run(args, base, container, metric_names):
    with (args.output / "metrics.jsonl").open("w") as output:
        initial = sample(base, container, metric_names, output)
        command = subprocess.Popen(args.command[1:], start_new_session=True)
        drain_deadline = None
        idle_samples = 0
        try:
            while True:
                exit_code = command.poll()
                current = sample(base, container, metric_names, output)
                if exit_code is not None:
                    if drain_deadline is None:
                        drain_deadline = time.monotonic() + args.drain_timeout
                    if (value(current, "media.extraction.active", "VALUE") == 0
                            and value(current, "media.extraction.queue.size", "VALUE") == 0):
                        idle_samples += 1
                        if idle_samples == 2:
                            return initial, current, exit_code, True
                    else:
                        idle_samples = 0
                    if time.monotonic() >= drain_deadline:
                        return initial, current, exit_code, False
                time.sleep(1)
        except (Exception, KeyboardInterrupt):
            stop_command(command)
            raise


def save_queue_waits(args, container, started_at, ended_at):
    waits = []
    with (args.output / "queue-wait.jsonl").open("w") as output:
        for line in docker("logs", "--timestamps", "--since", started_at, "--until", ended_at,
                           container, timeout=30).splitlines():
            timestamp, _, message = line.partition(" ")
            try:
                entry = json.loads(message)
            except ValueError:
                entry = None
            if isinstance(entry, dict):
                message = entry.get("message", "")
            if not isinstance(message, str):
                continue
            match = QUEUE_WAIT_LOG.search(message)
            if match and match[1].startswith(args.shortcode_prefix):
                wait = int(match[2])
                waits.append(wait)
                output.write(json.dumps({"timestamp": timestamp, "shortcode": match[1], "queueNs": wait}) + "\n")
    return sorted(waits)


def save_summary(args, summary):
    summary_json = json.dumps(summary, indent=2)
    (args.output / "summary.json").write_text(summary_json + "\n")
    print(summary_json)


def main():
    args = parse_args()
    try:
        inspect_format = "{{.Id}} {{.State.Running}} {{.State.StartedAt}}"
        identity = docker("inspect", "--type", "container", "--format", inspect_format, args.container).strip()
        container, running, _ = identity.split()
        if running != "true":
            raise RuntimeError("The backend container is not running")
        binding = docker("port", container, "8080/tcp").strip()
        if not re.fullmatch(r"127\.0\.0\.1:\d+", binding):
            raise RuntimeError(f"Expected a single backend port on 127.0.0.1, got {binding!r}")
        base = f"http://{binding}"
        available = set(read_actuator(base, "")["names"])
        missing = set(EXTRACTION_METRICS) - available
        if missing:
            raise RuntimeError("Deploy the measurement code and enable load-test mode. Missing metrics: "
                               + ", ".join(sorted(missing)))
        names = EXTRACTION_METRICS + tuple(name for name in OPTIONAL_METRICS if name in available)
        args.output.mkdir(parents=True)
        summary = {"startedAt": utc_now(), "containerId": container, "shortcodePrefix": args.shortcode_prefix,
                   "queueWaitP95Ms": None}
        try:
            initial, final, exit_code, drained = record_run(args, base, container, names)
            if docker("inspect", "--type", "container", "--format", inspect_format, container).strip() != identity:
                raise RuntimeError("The backend container restarted or stopped during the run")
        except COLLECTION_ERRORS + (KeyboardInterrupt,) as error:
            summary.update(endedAt=utc_now(), error=str(error) or "Interrupted")
            try:
                waits = save_queue_waits(args, container, summary["startedAt"], summary["endedAt"])
                summary["queueWaitSamples"] = len(waits)
            except COLLECTION_ERRORS as log_error:
                summary["queueLogError"] = str(log_error)
            save_summary(args, summary)
            raise

        summary["endedAt"] = utc_now()
        try:
            waits = save_queue_waits(args, container, summary["startedAt"], summary["endedAt"])
        except COLLECTION_ERRORS as error:
            summary["error"] = str(error)
            save_summary(args, summary)
            raise
        sample_metric = "media.extraction.queue.wait.dedicated.samples"
        expected_samples = int(value(final, sample_metric, "COUNT") - value(initial, sample_metric, "COUNT"))
        summary.update({
            "commandExitCode": exit_code,
            "drained": drained,
            "expectedQueueWaitSamples": expected_samples,
            "queueWaitSamples": len(waits),
            "allExecutorRejected": value(final, "media.extraction.rejected", "COUNT")
            - value(initial, "media.extraction.rejected", "COUNT"),
        })
        samples_complete = bool(waits) and len(waits) == expected_samples
        if samples_complete and drained:
            rank = (95 * len(waits) + 99) // 100
            summary["queueWaitP95Ms"] = waits[rank - 1] / 1_000_000
        if not drained:
            summary["error"] = "The extraction executor did not drain before the timeout"
        elif not samples_complete:
            summary["error"] = (f"Expected {expected_samples} dedicated samples, found {len(waits)}. "
                                "Use fresh shortcodes and run one test at a time.")
        elif exit_code:
            summary["error"] = f"The load generator exited with status {exit_code}"
        save_summary(args, summary)
        if "error" in summary:
            raise RuntimeError(summary["error"])
        return 0
    except COLLECTION_ERRORS + (KeyboardInterrupt,) as error:
        message = str(error) or "Interrupted"
        raise SystemExit(f"Measurement failed: {message}. Output directory: {args.output}.") from error


if __name__ == "__main__":
    raise SystemExit(main())
