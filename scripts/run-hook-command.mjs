import { spawn } from "node:child_process";
import { constants } from "node:os";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("A hook check command is required");

let child;
let interrupted = 0;
let escalation;

function signalGroup(signal) {
	if (!child?.pid) return;
	try {
		process.kill(-child.pid, signal);
	} catch (error) {
		if (error.code !== "ESRCH") throw error;
	}
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.on(signal, () => {
		interrupted ||= 128 + constants.signals[signal];
		signalGroup("SIGTERM");
		escalation ??= setTimeout(() => signalGroup("SIGKILL"), 1000).unref();
	});
}

child = spawn(command, args, { detached: true, stdio: "inherit" });
child.once("spawn", () => {
	if (interrupted) signalGroup("SIGTERM");
});
child.once("error", (error) => {
	clearTimeout(escalation);
	console.error(error.message);
	process.exit(interrupted || 1);
});
child.once("exit", (code, signal) => {
	clearTimeout(escalation);
	if (interrupted) signalGroup("SIGKILL");
	process.exit(interrupted || code || (signal ? 128 + constants.signals[signal] : 0));
});
