/* MagicMirror² Module: MMM-Cal
 * Shows upcoming holidays with a countdown ("Today", "Tomorrow", "in 6 days").
 * Holiday dates are calculated locally (no internet feed or API key needed).
 * MIT Licensed.
 */

/* global Module, config */

Module.register("MMM-Cal", {
	defaults: {
		maxHolidays: 6,          // how many upcoming holidays to list
		maxDays: 365,            // only list holidays within this many days
		showDate: true,          // show the holiday's date next to its name
		dateFormat: { month: "short", day: "numeric" }, // Intl date options for the date column
		highlightDays: 7,        // holidays this close (in days) are shown brighter
		fade: true,              // fade out holidays further down the list
		fadePoint: 0.5,          // where the fade starts (0 = top, 1 = bottom)
		showSymbol: true,        // show a calendar icon in front of each holiday
		symbol: "calendar-check",// Font Awesome icon name
		exclude: [],             // holiday names to hide, e.g. ["Groundhog Day", "Halloween"]
		customHolidays: [],      // your own dates, e.g. [{ name: "Mom's Birthday", date: "03-14" }]
		includeObserved: false,  // also list "(observed)" days when a federal holiday falls on a weekend
		birthdaysFile: "birthdays.txt", // text file in this module's folder; "" turns birthdays off
		birthdaySymbol: "birthday-cake", // Font Awesome icon for birthdays
		showAge: true,           // "Grandpa turns 70" when the birth year is in the file
		labels: {
			today: "Today!",
			tomorrow: "Tomorrow",
			inDays: "in {n} days",
			birthday: "{name}'s Birthday",
			turns: "{name} turns {age}"
		}
	},

	start () {
		this.holidays = [];
		this.birthdays = [];
		this.refresh();
		this.scheduleMidnight();
		// Hourly safety refresh (covers sleep/resume and clock changes)
		this.hourly = setInterval(() => this.refresh(), 60 * 60 * 1000);
	},

	getStyles () {
		return ["font-awesome.css", this.file("MMM-Cal.css")];
	},

	async refresh () {
		await this.loadBirthdays();
		this.holidays = this.upcoming(new Date());
		this.updateDom(this.config.animationSpeed || 0);
	},

	/* ---------- birthdays file ---------- */

	// Re-read every refresh (hourly and at midnight), so edits show up without a restart
	async loadBirthdays () {
		if (!this.config.birthdaysFile) {
			this.birthdays = [];
			return;
		}
		try {
			const url = `${this.file(this.config.birthdaysFile)}?t=${Date.now()}`;
			const res = await fetch(url, { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			this.birthdays = this.parseBirthdays(await res.text());
		} catch (err) {
			console.warn(`[MMM-Cal] Could not read ${this.config.birthdaysFile}: ${err.message}`);
			// keep the last good list if the file can't be read this time
		}
	},

	// Lines look like "03-14, Mom" or "1956-11-22, Grandpa". "#" lines and blank lines are skipped.
	parseBirthdays (text) {
		const out = [];
		String(text).split(/\r?\n/).forEach((raw, i) => {
			const line = raw.trim();
			if (!line || line.startsWith("#")) return;
			const comma = line.indexOf(",");
			if (comma < 0) {
				console.warn(`[MMM-Cal] birthdays line ${i + 1} has no comma: "${line}"`);
				return;
			}
			const datePart = line.slice(0, comma).trim();
			const name = line.slice(comma + 1).trim();
			const m = datePart.match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
			const month = m ? Number(m[2]) : 0;
			const day = m ? Number(m[3]) : 0;
			if (!m || !name || month < 1 || month > 12 || day < 1 || day > 31) {
				console.warn(`[MMM-Cal] birthdays line ${i + 1} is not "MM-DD, Name" or "YYYY-MM-DD, Name": "${line}"`);
				return;
			}
			out.push({ name, month, day, year: m[1] ? Number(m[1]) : null });
		});
		return out;
	},

	birthdaysFor (year) {
		const L = this.config.labels;
		return (this.birthdays || []).map((b) => {
			let day = b.day;
			// Feb 29 birthdays show on Feb 28 in non-leap years
			if (b.month === 2 && b.day === 29 && new Date(year, 1, 29).getMonth() !== 1) day = 28;
			const age = b.year ? year - b.year : null;
			const label = this.config.showAge && age !== null && age > 0
				? L.turns.replace("{name}", b.name).replace("{age}", age)
				: L.birthday.replace("{name}", b.name);
			return { name: label, person: b.name, date: new Date(year, b.month - 1, day), birthday: true };
		});
	},

	scheduleMidnight () {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
		clearTimeout(this.midnight);
		this.midnight = setTimeout(() => {
			this.refresh();
			this.scheduleMidnight();
		}, next - now);
	},

	/* ---------- date helpers ---------- */

	// nth weekday of a month: weekday 0=Sun..6=Sat, n=1..5, or n=-1 for "last"
	nthWeekday (year, month, weekday, n) {
		if (n > 0) {
			const first = new Date(year, month, 1);
			const offset = (weekday - first.getDay() + 7) % 7;
			return new Date(year, month, 1 + offset + (n - 1) * 7);
		}
		const last = new Date(year, month + 1, 0);
		const offset = (last.getDay() - weekday + 7) % 7;
		return new Date(year, month, last.getDate() - offset);
	},

	// Easter Sunday (Anonymous Gregorian algorithm)
	easter (year) {
		const a = year % 19;
		const b = Math.floor(year / 100);
		const c = year % 100;
		const d = Math.floor(b / 4);
		const e = b % 4;
		const f = Math.floor((b + 8) / 25);
		const g = Math.floor((b - f + 1) / 3);
		const h = (19 * a + b - d - g + 15) % 30;
		const i = Math.floor(c / 4);
		const k = c % 4;
		const l = (32 + 2 * e + 2 * i - h - k) % 7;
		const m = Math.floor((a + 11 * h + 22 * l) / 451);
		const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
		const day = ((h + l - 7 * m + 114) % 31) + 1;
		return new Date(year, month, day);
	},

	// All holidays for one year: [{ name, date, federal }]
	holidaysFor (year) {
		const d = (m, day) => new Date(year, m, day);
		const nth = (m, wd, n) => this.nthWeekday(year, m, wd, n);
		const easter = this.easter(year);
		const list = [
			{ name: "New Year's Day", date: d(0, 1), federal: true },
			{ name: "Martin Luther King Jr. Day", date: nth(0, 1, 3), federal: true },
			{ name: "Groundhog Day", date: d(1, 2) },
			{ name: "Valentine's Day", date: d(1, 14) },
			{ name: "Presidents' Day", date: nth(1, 1, 3), federal: true },
			{ name: "St. Patrick's Day", date: d(2, 17) },
			{ name: "Good Friday", date: new Date(year, easter.getMonth(), easter.getDate() - 2) },
			{ name: "Easter Sunday", date: easter },
			{ name: "Mother's Day", date: nth(4, 0, 2) },
			{ name: "Memorial Day", date: nth(4, 1, -1), federal: true },
			{ name: "Flag Day", date: d(5, 14) },
			{ name: "Father's Day", date: nth(5, 0, 3) },
			{ name: "Juneteenth", date: d(5, 19), federal: true },
			{ name: "Independence Day", date: d(6, 4), federal: true },
			{ name: "Labor Day", date: nth(8, 1, 1), federal: true },
			{ name: "Columbus Day", date: nth(9, 1, 2), federal: true },
			{ name: "Halloween", date: d(9, 31) },
			{ name: "Veterans Day", date: d(10, 11), federal: true },
			{ name: "Thanksgiving Day", date: nth(10, 4, 4), federal: true },
			{ name: "Christmas Eve", date: d(11, 24) },
			{ name: "Christmas Day", date: d(11, 25), federal: true },
			{ name: "New Year's Eve", date: d(11, 31) }
		];

		if (this.config.includeObserved) {
			list.filter((h) => h.federal).forEach((h) => {
				const wd = h.date.getDay();
				if (wd === 6 || wd === 0) {
					const shift = wd === 6 ? -1 : 1;
					list.push({
						name: `${h.name} (observed)`,
						date: new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate() + shift)
					});
				}
			});
		}

		(this.config.customHolidays || []).forEach((c) => {
			if (!c || !c.name || !c.date) return;
			const parts = String(c.date).split("-").map(Number);
			if (parts.length === 2) { // "MM-DD" repeats every year
				list.push({ name: c.name, date: d(parts[0] - 1, parts[1]), custom: true });
			} else if (parts.length === 3 && parts[0] === year) { // "YYYY-MM-DD" one time only
				list.push({ name: c.name, date: d(parts[1] - 1, parts[2]), custom: true });
			}
		});

		return list;
	},

	upcoming (now) {
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const exclude = (this.config.exclude || []).map((n) => n.toLowerCase());
		const dayMs = 24 * 60 * 60 * 1000;
		const all = [
			...this.holidaysFor(today.getFullYear()),
			...this.holidaysFor(today.getFullYear() + 1),
			...this.birthdaysFor(today.getFullYear()),
			...this.birthdaysFor(today.getFullYear() + 1)
		];
		return all
			.filter((h) => !exclude.includes(h.name.toLowerCase()) && !(h.person && exclude.includes(h.person.toLowerCase())))
			.map((h) => ({ ...h, days: Math.round((h.date - today) / dayMs) }))
			.filter((h) => h.days >= 0 && h.days <= this.config.maxDays)
			.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
			.slice(0, this.config.maxHolidays);
	},

	countdown (days) {
		const L = this.config.labels;
		if (days === 0) return L.today;
		if (days === 1) return L.tomorrow;
		return L.inDays.replace("{n}", days);
	},

	/* ---------- display ---------- */

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-cal";

		if (!this.holidays.length) {
			wrapper.className += " dimmed light small";
			wrapper.textContent = "No upcoming holidays";
			return wrapper;
		}

		const table = document.createElement("table");
		table.className = "small";
		const locale = config.locale || config.language || "en-US";
		const count = this.holidays.length;
		const fadeStart = Math.floor(count * this.config.fadePoint);

		this.holidays.forEach((h, i) => {
			const row = document.createElement("tr");
			row.className = h.days <= this.config.highlightDays ? "bright soon" : "normal";
			if (h.days === 0) row.className += " today";
			if (h.birthday) row.className += " birthday";

			if (this.config.showSymbol) {
				const sym = document.createElement("td");
				sym.className = "symbol";
				const icon = document.createElement("span");
				icon.className = `fa fa-fw fa-${h.birthday ? this.config.birthdaySymbol : this.config.symbol}`;
				sym.appendChild(icon);
				row.appendChild(sym);
			}

			const name = document.createElement("td");
			name.className = "title";
			name.textContent = h.name;
			row.appendChild(name);

			if (this.config.showDate) {
				const date = document.createElement("td");
				date.className = "date dimmed";
				date.textContent = h.date.toLocaleDateString(locale, this.config.dateFormat);
				row.appendChild(date);
			}

			const left = document.createElement("td");
			left.className = "countdown";
			left.textContent = this.countdown(h.days);
			row.appendChild(left);

			if (this.config.fade && count > 1 && i >= fadeStart) {
				const steps = count - fadeStart;
				row.style.opacity = 1 - ((i - fadeStart + 1) / (steps + 1)) * 0.8;
			}

			table.appendChild(row);
		});

		wrapper.appendChild(table);
		return wrapper;
	},

	suspend () {
		clearTimeout(this.midnight);
		clearInterval(this.hourly);
	},

	resume () {
		this.refresh();
		this.scheduleMidnight();
		clearInterval(this.hourly);
		this.hourly = setInterval(() => this.refresh(), 60 * 60 * 1000);
	}
});
