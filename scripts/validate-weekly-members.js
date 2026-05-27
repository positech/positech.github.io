const fs = require("fs");

const csvPath =
  process.argv[2] || "/Users/jaewonk/Downloads/Positech membership history - Sheet1 (1).csv";
const htmlPath = process.argv[3] || "weekly.html";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

const csvRows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const profileRows = csvRows
  .filter((row) => !row[0] && row[3] && row[4] && row[5] && row[6])
  .map((row) => ({
    preferredName: row[3].trim(),
    fullName: row[4].trim(),
    pronouns: row[5].trim(),
    institution: row[6].trim(),
  }));
const profilesByPreferredName = new Map(
  profileRows.map((row) => [row.preferredName, row])
);
const membershipRows = csvRows
  .slice(1)
  .filter((row) => row[0] && row[0].trim())
  .filter((row) => row[0].trim() !== "Nadia")
  .map((row) => {
    const preferredName = row[0].trim();
    const profile = profilesByPreferredName.get(preferredName);

    return {
      preferredName,
      fullName: profile?.fullName || preferredName,
      pronouns: profile?.pronouns || "",
      organizedYears: [2024, 2025, 2026].filter((year, index) => row[3 + index] === "1"),
      weeklyYears: [2023, 2024, 2025, 2026].filter((year, index) => row[6 + index] === "1"),
      admin: row[10] === "1",
    };
  });

const theia = membershipRows.find((row) => row.preferredName === "Theia");
if (theia && !theia.organizedYears.includes(2026)) {
  theia.organizedYears.push(2026);
}

const adminOverrides = new Map([
  ["Lizzy", false],
  ["Lizzie", true],
]);
for (const member of membershipRows) {
  if (adminOverrides.has(member.preferredName)) {
    member.admin = adminOverrides.get(member.preferredName);
  }
}

const expectedOrder = [
  "JaeWon",
  "Lindsay",
  "Louisa",
  "Lizzie",
  "Meryl",
  "Jose",
  "Lizzy",
  "Theia",
  "Bingxu",
  "Cassidy",
  "Angela",
  "Anna",
  "Shanley",
  "Jina",
];
const expectedNames = membershipRows.map((row) => row.preferredName);
const html = fs.readFileSync(htmlPath, "utf8");
const memberCardMatches = [...html.matchAll(/<article class="weekly-member-card"[\s\S]*?<\/article>/g)];
const failures = [];

if (memberCardMatches.length !== expectedNames.length) {
  failures.push(`Expected ${expectedNames.length} member cards, found ${memberCardMatches.length}`);
}

const actualOrder = memberCardMatches.map(
  (match) => match[0].match(/data-name="([^"]+)"/)?.[1] || ""
);
const expectedDataOrder = expectedOrder.map((name) => name.toLowerCase());
if (actualOrder.join(",") !== expectedDataOrder.join(",")) {
  failures.push(`Unexpected member order: ${actualOrder.join(", ")}`);
}

for (const member of membershipRows) {
  const escapedName = member.preferredName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedFullName = member.fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pronounDisplay = `(${member.pronouns})`;
  const escapedPronouns = pronounDisplay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cardMatch = html.match(
    new RegExp(`<article class="weekly-member-card"[^>]*data-name="${escapedName.toLowerCase()}"[\\s\\S]*?<\\/article>`)
  );

  if (!cardMatch) {
    failures.push(`${member.preferredName}: missing member card`);
    continue;
  }

  const card = cardMatch[0];
  if (!new RegExp(`<h5[^>]*>\\s*<a [^>]*>${escapedFullName}<\\/a>\\s*<\\/h5>`).test(card)) {
    failures.push(`${member.preferredName}: full preferred name is not used as linked display name`);
  }

  if (member.pronouns && !new RegExp(`<p class="weekly-member-pronouns">\\s*${escapedPronouns}\\s*<\\/p>`).test(card)) {
    failures.push(`${member.preferredName}: missing pronouns`);
  }

  if (!/<a [^>]*>\s*<img /.test(card)) {
    failures.push(`${member.preferredName}: photo is not linked`);
  }

  for (const year of member.organizedYears) {
    if (!card.includes(`Organizer ${year}`)) {
      failures.push(`${member.preferredName}: missing Organizer ${year} badge`);
    }
    if (!card.includes(`organized-${year}`)) {
      failures.push(`${member.preferredName}: missing organized-${year} filter marker`);
    }
  }

  for (const year of member.weeklyYears) {
    if (!card.includes(`Weekly ${year}`)) {
      failures.push(`${member.preferredName}: missing Weekly ${year} badge`);
    }
    if (!card.includes(`weekly-${year}`)) {
      failures.push(`${member.preferredName}: missing weekly-${year} filter marker`);
    }
  }

  const badgeOrder = [...card.matchAll(/<span class="weekly-badge [^"]+">([^<]+)<\/span>/g)].map(
    (match) => match[1]
  );
  const expectedBadgeOrder = [
    ...(member.admin ? ["Current Admin"] : []),
    ...[...member.organizedYears].sort((a, b) => b - a).map((year) => `Organizer ${year}`),
    ...[...member.weeklyYears].sort((a, b) => b - a).map((year) => `Weekly ${year}`),
  ];
  if (badgeOrder.join(",") !== expectedBadgeOrder.join(",")) {
    failures.push(`${member.preferredName}: unexpected badge order ${badgeOrder.join(", ")}`);
  }

  const hasAdminBadge = card.includes('class="weekly-badge badge-admin"') && card.includes("Current Admin");
  const hasAdminTag = card.includes("current-admins");
  if (member.admin && !hasAdminBadge) {
    failures.push(`${member.preferredName}: missing Current Admin badge`);
  }
  if (member.admin && !hasAdminTag) {
    failures.push(`${member.preferredName}: missing current-admins filter marker`);
  }
  if (!member.admin && hasAdminBadge) {
    failures.push(`${member.preferredName}: should not have Current Admin badge`);
  }
  if (!member.admin && hasAdminTag) {
    failures.push(`${member.preferredName}: should not have current-admins filter marker`);
  }
}

for (const removedName of ["Ruotong", "Nisha", "Nadia"]) {
  if (html.includes(removedName)) {
    failures.push(`${removedName}: should not be listed because they are absent from the CSV`);
  }
}

for (const filter of [
  "current-admins",
  "weekly-2023",
  "weekly-2024",
  "weekly-2025",
  "weekly-2026",
  "organized-2024",
  "organized-2025",
  "organized-2026",
]) {
  if (!html.includes(`data-filter="${filter}"`)) {
    failures.push(`Missing filter control for ${filter}`);
  }
}

const filterOrder = [...html.matchAll(/data-filter="(weekly-\d{4}|organized-\d{4})"/g)].map(
  (match) => match[1]
);
const expectedFilterOrder = [
  "weekly-2026",
  "weekly-2025",
  "weekly-2024",
  "weekly-2023",
  "organized-2026",
  "organized-2025",
  "organized-2024",
];
if (filterOrder.join(",") !== expectedFilterOrder.join(",")) {
  failures.push(`Unexpected filter order: ${filterOrder.join(", ")}`);
}

if (!html.includes('<span class="weekly-filter-label">Weekly Exchange</span>')) {
  failures.push("Weekly filter label should read Weekly Exchange");
}

if (!html.includes('type="checkbox"') || !html.includes('data-filter="current-admins"')) {
  failures.push("Current admins filter should be a checkbox");
}

if (!html.includes("weeklyFilterClear")) {
  failures.push("Missing clear filter button");
}

if (!html.includes("some((filter) => tags.includes(filter))")) {
  failures.push("Missing OR logic within weekly/organizer filter groups");
}

if (!html.includes("applyWeeklyMemberFilter")) {
  failures.push("Missing weekly member filter script");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Validated ${expectedNames.length} CSV-listed weekly exchange profiles.`);
