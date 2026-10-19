"""실제 외부 API를 호출하지 않고 입력 변형·전체 장소·요청 간격과 캐시를 검증한다."""

import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
import urllib.error


SPEC = importlib.util.spec_from_file_location("run_eval", pathlib.Path(__file__).with_name("run_eval.py"))
evaluation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluation)


class FakeClock:
    def __init__(self):
        self.seconds = 0.0
        self.sleeps = []

    def now(self):
        return self.seconds

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.seconds += seconds


class FakeGemini:
    def __init__(self, clock, responses):
        self.clock = clock
        self.responses = list(responses)
        self.started = []
        self.bodies = []

    def __call__(self, request, timeout):
        self.started.append(self.clock.now())
        self.bodies.append(json.loads(request.data))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return io.StringIO(json.dumps(response))


class EvaluationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = pathlib.Path(self.directory.name)
        self.clock = FakeClock()
        original = evaluation.GEMINI_LIMITER
        evaluation.GEMINI_LIMITER = evaluation.GeminiRequestLimiter(self.clock.now, self.clock.sleep)
        self.addCleanup(setattr, evaluation, "GEMINI_LIMITER", original)
        self.success = {"candidates": [{"content": {"parts": [{"text": '{"places":[]}'}]}}]}

    def generate(self, opener, name="response.json", url_context=False):
        return evaluation.gemini_generate("test-key", "test-model", [{"text": "입력"}],
                                          evaluation.SYSTEM_INSTRUCTION, self.folder / name, url_context, opener)

    def test_음식점_외_지도_장소도_허용하고_식별자나_이름이_없는_결과는_제외한다(self):
        documents = [
            {"id": "1", "place_name": "소품샵", "category_name": "쇼핑,유통"},
            {"id": "2", "place_name": "전시장", "category_name": "문화,예술"},
            {"id": "3", "place_name": "음식점", "category_name": "음식점 > 한식"},
            {"id": "4"},
        ]
        self.assertEqual(evaluation.place_documents({"documents": documents}), documents[:3])
        self.assertIn("장소 유형에 제한을 두지 않는다", evaluation.SYSTEM_INSTRUCTION)

    def test_캡션_영상_전체입력_변형을_유지한다(self):
        video = self.folder / "video.mp4"
        video.write_bytes(b"video fixture")
        meta = {"caption": "캡션상호", "video_file": str(video), "comments": ["댓글주소"],
                "location": "위치태그", "uploader": "작성자이름"}
        caption, _, _ = evaluation.build_parts("caption", meta)
        media, _, _ = evaluation.build_parts("video", meta)
        both, _, _ = evaluation.build_parts("both", meta)
        self.assertEqual(len(caption), 1)
        self.assertNotIn("댓글주소", str(caption))
        self.assertNotIn("캡션상호", str(media))
        self.assertIn("inline_data", media[-1])
        for text in ["캡션상호", "댓글주소", "위치태그", "작성자이름"]:
            self.assertIn(text, str(both))
        self.assertIn("inline_data", both[-1])

    def test_사진_캐러셀도_video_변형에서_원본_순서로_전달한다(self):
        photos = [self.folder / "01.jpg", self.folder / "02.jpg"]
        for index, photo in enumerate(photos):
            photo.write_bytes(bytes([index]))
        parts, _, _ = evaluation.build_parts("video", {"photo_files": [str(p) for p in photos]})
        self.assertEqual([p["inline_data"]["data"] for p in parts[1:]], ["AA==", "AQ=="])

    def test_16건의_분석_요청을_5초_간격으로_시작한다(self):
        opener = FakeGemini(self.clock, [self.success] * 16)
        for index in range(16):
            self.generate(opener, f"response-{index}.json")
        self.assertEqual(opener.started, [5.0 * index for index in range(16)])

    def test_이미_5초가_지났으면_더_기다리지_않는다(self):
        opener = FakeGemini(self.clock, [self.success] * 2)
        self.generate(opener, "first.json")
        self.clock.seconds += 8
        self.generate(opener, "second.json")
        self.assertEqual(opener.started, [0, 8])
        self.assertEqual(self.clock.sleeps, [])

    def test_503_재시도에도_같은_요청_간격을_적용한다(self):
        error = urllib.error.HTTPError("https://example.com", 503, "unavailable", {}, io.BytesIO(b"error"))
        opener = FakeGemini(self.clock, [error, self.success])
        self.generate(opener)
        self.assertEqual(opener.started, [0, 5])

    def test_429_재시도에도_같은_요청_간격을_적용한다(self):
        error = urllib.error.HTTPError("https://example.com", 429, "rate limit", {}, io.BytesIO(b"error"))
        opener = FakeGemini(self.clock, [error, self.success])
        self.generate(opener)
        self.assertEqual(opener.started, [0, 5])

    def test_URL_Context를_끈_재요청도_5초_뒤에_시작한다(self):
        error = urllib.error.HTTPError("https://example.com", 400, "unsupported", {}, io.BytesIO(b"error"))
        opener = FakeGemini(self.clock, [error, self.success])
        self.generate(opener, url_context=True)
        self.assertEqual(opener.started, [0, 5])
        self.assertIn("tools", opener.bodies[0])
        self.assertNotIn("tools", opener.bodies[1])

    def test_성공한_응답을_캐시하면_다음에는_호출하거나_기다리지_않는다(self):
        opener = FakeGemini(self.clock, [self.success])
        first = self.generate(opener)
        second = self.generate(opener)
        self.assertEqual(first, second)
        self.assertEqual(opener.started, [0])
        self.assertEqual(self.clock.sleeps, [])

    def test_실제_모델_요청에도_음식점_외_장소_지침을_전달한다(self):
        opener = FakeGemini(self.clock, [self.success])
        self.generate(opener)
        instruction = opener.bodies[0]["system_instruction"]["parts"][0]["text"]
        self.assertIn("소품샵", instruction)
        self.assertIn("장소 유형에 제한을 두지 않는다", instruction)
        self.assertNotIn("먹고 마시는 가게만", instruction)

    def test_현재_정답의_미검증_사례와_동일장소_별칭을_반영한다(self):
        cases = evaluation.load_cases(None, 0)
        self.assertEqual(len(cases), 40)
        self.assertEqual(sum(c["verification_status"] == "VERIFIED" for c in cases), 28)
        cafe = next(c for c in cases if c["case_id"] == "C030")
        self.assertEqual(cafe["accepted_aliases"]["1296688953"], "851856623")
        self.assertEqual(evaluation.score(cafe, [], 0, False), ("unverified", "unverified"))
        self.assertEqual(evaluation.score(cafe, [], 0, False, True),
                         ("processing_failed", "processing_failed"))
        empty = {"expected_ids": [], "verification_status": "VERIFIED"}
        self.assertEqual(evaluation.score(empty, [], 0, False, True),
                         ("processing_failed", "processing_failed"))

    def test_Python_실험으로_Java_운영_결과를_덮어쓰지_않는다(self):
        target = self.folder / "both.json"
        target.write_text('{"runner":"java-operational"}', encoding="utf-8")
        with self.assertRaises(SystemExit):
            evaluation.write_results(target, {"variant": "both"})
        self.assertEqual(json.loads(target.read_text())["runner"], "java-operational")


if __name__ == "__main__":
    unittest.main()
