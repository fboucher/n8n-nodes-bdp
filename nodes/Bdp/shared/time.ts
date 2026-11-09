const ISO_DATE_TIME_WITH_ZONE =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/i;

export function normalizeTimestamp(value: string, fieldName: string): string {
	const match = value.match(ISO_DATE_TIME_WITH_ZONE);
	if (!match) {
		throw new Error(
			`${fieldName} must be an ISO 8601 timestamp with seconds and an explicit UTC offset or Z.`,
		);
	}

	const [, yearText, monthText, dayText, hour, minute, second, , zone] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	const date = new Date(value);
	if (
		Number.isNaN(date.getTime()) ||
		year < 1 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > daysInMonth[month - 1] ||
		Number(hour) > 23 ||
		Number(minute) > 59 ||
		Number(second) > 59 ||
		(zone.toUpperCase() !== 'Z' &&
			(Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))
	) {
		throw new Error(`${fieldName} is not a valid ISO 8601 timestamp.`);
	}
	return date.toISOString();
}

export function normalizeWindow(start: string, end: string): { from: string; to: string } {
	const from = normalizeTimestamp(start, 'Start');
	const to = normalizeTimestamp(end, 'End');
	if (Date.parse(from) >= Date.parse(to)) {
		throw new Error('Start must be earlier than End.');
	}
	return { from, to };
}
