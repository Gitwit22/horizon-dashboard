const { markOffline } = require('./agentConnectivity');

let installed = false;

function installCrashProtection(agentName = 'horizon') {
  if (installed) return;
  installed = true;

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : null;
    console.error(`[${agentName}] unhandledRejection:`, message);
    if (stack) console.error(stack);
    markOffline(`unhandledRejection: ${message}`);
  });

  process.on('uncaughtException', (error) => {
    const message = error?.message || String(error);
    console.error(`[${agentName}] uncaughtException:`, message);
    if (error?.stack) console.error(error.stack);
    markOffline(`uncaughtException: ${message}`);
  });
}

module.exports = {
  installCrashProtection,
};
