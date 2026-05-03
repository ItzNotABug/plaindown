/**
 * Handles logging with consistent formatting for the plaindown plugin
 * Uses custom purple color (#8B7CF6) for branding
 */

const PURPLE = "\x1b[38;2;139;124;246m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const PREFIX = `${PURPLE}[plaindown]${RESET}`;

let messageQueue: string[] = [];
let isQueuing = false;

export function startQueuing() {
	isQueuing = true;
	messageQueue = [];
}

export function flushQueue() {
	for (const msg of messageQueue) {
		console.log(msg);
	}
	messageQueue = [];
	isQueuing = false;
}

export function warn(message: string) {
	const formatted = `${PREFIX} ${YELLOW}⚠${RESET} ${message}`;
	if (isQueuing) {
		messageQueue.push(formatted);
	} else {
		console.warn(formatted);
	}
}

export function success(message: string) {
	const formatted = `${PREFIX} ${GREEN}✓${RESET} ${message}`;
	if (isQueuing) {
		messageQueue.push(formatted);
	} else {
		console.log(formatted);
	}
}
