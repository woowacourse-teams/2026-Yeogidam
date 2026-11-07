import base64
import gzip
import importlib.util
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("alerts", Path(__file__).with_name("alerts_to_discord.py"))
alerts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alerts)


class DiscordServer:
    def __init__(self, status=200):
        self.requests = []
        self.attempts = []
        self.responses = []
        self.status = status
        self.response_allowed = threading.Event()
        self.response_allowed.set()
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                request = (self.path, self.headers["Content-Type"], body)
                owner.attempts.append(request)
                status, headers, response_body = owner.status, {}, (owner.url + " discord-test-secret").encode()
                if owner.responses:
                    status, headers, response_body = owner.responses.pop(0)
                if 200 <= status < 300:
                    owner.requests.append(request)
                owner.response_allowed.wait(3)
                self.send_response(status)
                for key, value in headers.items():
                    self.send_header(key, value)
                self.end_headers()
                try:
                    self.wfile.write(response_body)
                except BrokenPipeError:
                    pass

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}/api/webhooks/123/discord-test-secret"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.response_allowed.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


def report():
    return {
        "environment": "prod", "media_id": 123, "started_at": "2026-10-20T00:00:00Z",
        "instagram_url": "https://www.instagram.com/reel/example/", "analysis_status": "FAILED",
        "failure_reason": "PLACE_NOT_MATCHED", "failure_stage": "KAKAO_SEARCH",
        "content": {"status": "FETCHED", "caption": "연남동 카페 A", "author": "fixture"},
        "gemini_results": [{"stage": "GEMINI_CAPTION", "response_count": 1, "places": [{
            "name_in_caption": "카페 A", "name_search_hint": "카페 에이", "account_hints": ["cafe-a"],
            "location_hints": [{"type": "REGION", "value": "연남동", "basis": "CAPTION"}],
            "category_hint": "카페",
        }], "raw_json": '{"places":[{"nameInCaption":"카페 A","nameSearchHint":"카페 에이","accountHints":["cafe-a"],'
                         '"locationHints":[{"type":"REGION","value":"연남동","basis":"CAPTION"}]}]}'}],
        "kakao_requests": [{"stage": "KAKAO_SEARCH", "query": "카페 에이 연남동", "parameters": {"size": "15", "x": "127.0", "y": "37.5", "radius": "3000"},
                            "http_status": 200, "response_count": 0, "candidates": []}],
        "http_results": [], "error": None, "diagnostics_truncated": False,
    }


def sns_event(body):
    return {"Records": [{"Sns": {"Message": json.dumps(body, ensure_ascii=False)}}]}


def log_line(diagnostic=None, version=1, level="WARN", event_type="PLACE_EXTRACTION_FAILED"):
    return {"level": level, "type": event_type, "version": version,
            "report": report() if diagnostic is None else diagnostic,
            "message": "장소 추출 실패"}


def logs_event(*lines, message_type="DATA_MESSAGE"):
    payload = {"owner": "123456789012", "logGroup": "/yeogidam/prod/backend", "logStream": "backend",
               "messageType": message_type, "subscriptionFilters": ["extraction-failure"],
               "logEvents": [{"id": str(index), "timestamp": 1792454400000,
                              "message": json.dumps(line, ensure_ascii=False)} for index, line in enumerate(lines)]}
    compressed = gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    return {"awslogs": {"data": base64.b64encode(compressed).decode("ascii")}}


class AlertsTest(unittest.TestCase):
    def setUp(self):
        self.discord = DiscordServer()
        self.addCleanup(self.discord.close)
        self.env = patch.dict(os.environ, {"DISCORD_WEBHOOK_URL": self.discord.url})
        self.env.start()
        self.addCleanup(self.env.stop)

    def payloads(self):
        payloads = []
        for path, content_type, body in self.discord.requests:
            self.assertIn("wait=true", path)
            self.assertTrue(content_type.startswith("application/json"))
            payload = json.loads(body)
            self.assertNotIn("attachments", payload)
            self.assertEqual(payload["allowed_mentions"], {"parse": []})
            payloads.append(payload)
        return payloads

    def content(self):
        return "\n".join(payload["content"] for payload in self.payloads())

    def test_기존_SNS_CloudWatch_알람과_일반_문장_전송을_유지한다(self):
        # given
        alarm = {"AlarmName": "prod-cpu", "NewStateValue": "ALARM", "NewStateReason": "threshold",
                 "StateChangeTime": "2026-10-20T00:00:00.000+0000", "AlarmDescription": "확인"}
        # when
        result = alerts.handler(sns_event(alarm), None)
        alerts.handler({"Records": [{"Sns": {"Message": "일반 알림"}}]}, None)
        # then
        payloads = self.payloads()
        self.assertEqual(result, {"sent": 1})
        self.assertEqual(payloads[0]["embeds"][0]["title"], "[ALARM] prod-cpu")
        self.assertEqual(payloads[0]["embeds"][0]["fields"][0]["value"], "2026-10-20 09:00:00 KST")
        self.assertEqual(payloads[1]["content"], "일반 알림")

    def test_WARN과_ERROR_진단만_게시물과_실패_이유_Gemini_카카오_결과를_문장으로_보낸다(self):
        # given
        diagnostic = report()
        diagnostic["kakao_requests"].append({"stage": "KAKAO_SEARCH", "query": "카페 에이", "parameters": {},
            "http_status": 200, "response_count": 1, "candidates": [{"kakao_place_id": "9090",
            "name": "제외된 후보", "address": "서울 마포구 연남동 1", "road_address": None,
            "latitude": "invalid", "longitude": "127.0", "exclusion_reason": "잘못된 좌표"}]})
        non_prod = report()
        non_prod["environment"] = "prod,test"
        warn_log = log_line(diagnostic)
        warn_log["message"] = "표현을 바꾼 진단 로그"
        error_log = log_line(diagnostic, level="ERROR")
        error_log.pop("message")
        batch = logs_event({"level": "ERROR", "message": "장소 추출 실패"},
                           {"level": "WARN", "message": "장소 추출 실패"}, log_line(level="INFO"),
                           log_line(non_prod), warn_log, error_log)
        # when
        self.assertEqual(alerts.handler(logs_event(message_type="CONTROL_MESSAGE"), None), {"sent": 0})
        result = alerts.handler(batch, None)
        # then
        self.assertEqual(result, {"sent": 2})
        text = self.content()
        for value in ("media_id: 123", "PLACE_NOT_MATCHED", "KAKAO_SEARCH", "카페 A", "카페 에이",
                      "연남동", "CAPTION", "cafe-a", "카카오", "200", "0건", "1건", "9090", "잘못된 좌표"):
            self.assertIn(value, text)
        self.assertIn(diagnostic["gemini_results"][0]["raw_json"], text)
        for parameter in ("size=15", "x=127.0", "y=37.5", "radius=3000"):
            self.assertIn(parameter, text)
        self.assertNotIn("multipart/form-data", self.discord.requests[0][1])

    def test_긴_문장도_전송_제한을_기다린_뒤_누락_없이_나눠_보낸다(self):
        # given
        diagnostic = report()
        long_name = "시작장소" + "".join(f"장소{index:04d}😀@everyone" for index in range(600)) + "마지막장소"
        diagnostic["gemini_results"][0]["raw_json"] = json.dumps({"places": [{"nameInCaption": long_name}]}, ensure_ascii=False)
        self.discord.responses = [(429, {"Retry-After": "0.01"}, b"rate limited"),
                                  (429, {}, b'{"retry_after":0.01}')]
        # when
        result = alerts.handler(logs_event(log_line(diagnostic)), None)
        # then
        self.assertGreater(len(self.discord.requests), 1)
        self.assertEqual(result, {"sent": len(self.discord.requests)})
        self.assertEqual(len(self.discord.attempts), len(self.discord.requests) + 2)
        for payload in self.payloads():
            self.assertLessEqual(len(payload["content"].encode("utf-16-le")) // 2, 2000)
            self.assertTrue(payload["content"].startswith("media_id: 123\n"))
        text = "".join(payload["content"].removeprefix("media_id: 123\n") for payload in self.payloads())
        self.assertIn(long_name, text)


if __name__ == "__main__":
    unittest.main()
