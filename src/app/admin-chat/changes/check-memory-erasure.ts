import { forgetAllArgumentsSchema } from '../tools/forget-all-tool.ts';
import type { RiskyChecker } from './risky-check.ts';

const QUESTION = 'Xóa mọi điều tôi đã ghi nhớ riêng về bạn.';

export const checkMemoryErasure: RiskyChecker = async (_dependencies, _scope, parsedArguments) => {
  forgetAllArgumentsSchema.parse(parsedArguments);
  return { targets: null, writeQuestion: () => QUESTION };
};
