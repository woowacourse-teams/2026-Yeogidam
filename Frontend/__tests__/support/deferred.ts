/** 테스트가 정한 때에 끝나는 Promise입니다. 요청이 겹치는 순서를 테스트에서 직접 정할 때 씁니다. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}
