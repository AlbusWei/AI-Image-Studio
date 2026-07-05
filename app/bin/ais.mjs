// ─── 解析并执行 ────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  // exitOverride 会将 process.exit() 转为抛出 CommanderError；
  // help/version 的正常退出不需要输出错误信息
  if (err.code && /^(commander\.|ERR_COMMANDER)/.test(err.code)) {
    // help/version 等正常退出，仅设置 exitCode
    process.exitCode = err.exitCode ?? 0;
    return;
  }
  outputError({
    error: 'CLI_ERROR',
    message: err.message,
  });
});
