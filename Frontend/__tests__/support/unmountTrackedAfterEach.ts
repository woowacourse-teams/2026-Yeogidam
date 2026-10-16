import {unmountAllTracked} from './renderers';

// 모든 테스트 파일에 걸리는 정리입니다. renderTracked로 그린 렌더러만 내리고, 다른 방법으로 그린 렌더러와 mock, 타이머는 각 테스트 파일이 맡습니다.
// 파일 맨 위의 afterEach보다 먼저 돌므로, 화면을 내린 다음에 파일이 가로챈 함수와 가짜 타이머를 되돌립니다.
afterEach(unmountAllTracked);
