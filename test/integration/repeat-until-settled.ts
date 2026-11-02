export async function repeatUntilSettled<Result>(
  work: Promise<unknown>,
  action: () => Promise<Result>,
): Promise<Result[]> {
  let isSettled = false;
  const settle = () => {
    isSettled = true;
  };
  work.then(settle, settle);
  const results: Result[] = [];
  do {
    results.push(await action());
  } while (!isSettled);
  return results;
}
