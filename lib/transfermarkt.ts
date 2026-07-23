export type TransfermarktProfile = {
  sourceUrl: string;
  name: string;
  number: string;
  playerImage: string;
  clubLogo: string;
  leagueLogo: string;
  club: string;
  league: string;
  marketValue: string;
  birthDate: string;
  age: string;
  birthPlace: string;
  citizenship: string;
  height: string;
  position: string;
  foot: string;
  agent: string;
  nationalTeam: string;
  capsGoals: string;
  contract: string;
  joined: string;
  lastUpdate: string;
};

const EMPTY_PROFILE: TransfermarktProfile = {
  sourceUrl: "",
  name: "",
  number: "",
  playerImage: "",
  clubLogo: "",
  leagueLogo: "",
  club: "",
  league: "",
  marketValue: "",
  birthDate: "",
  age: "",
  birthPlace: "",
  citizenship: "",
  height: "",
  position: "",
  foot: "",
  agent: "",
  nationalTeam: "",
  capsGoals: "",
  contract: "",
  joined: "",
  lastUpdate: "",
};

export function createEmptyTransfermarktProfile(seed: Partial<TransfermarktProfile> = {}): TransfermarktProfile {
  return { ...EMPTY_PROFILE, ...seed };
}

function decode(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&euro;/gi, "€")
    .replace(/&#(d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function text(value = "") {
  return decode(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteImage(value = "") {
  const decoded = decode(value).trim();
  if (!decoded) return "";
  if (decoded.startsWith("//")) return `https:${decoded}`;
  return decoded.replace("https://tmssl.akamaized.net//", "https://tmssl.akamaized.net/");
}

function capture(html: string, pattern: RegExp) {
  return pattern.exec(html)?.[1] ?? "";
}

function dataHeaderValue(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(capture(html, new RegExp(`<li[^>]*class="[^"]*data-header__label[^"]*"[^>]*>\\s*${escaped}\\s*([\\s\\S]*?)<\\/li>`, "i")));
}

function infoTableValue(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(capture(html, new RegExp(`<span[^>]*info-table__content--regular[^>]*>\\s*${escaped}\\s*<\\/span>\\s*<span[^>]*info-table__content--bold[^>]*>([\\s\\S]*?)<\\/span>`, "i")));
}

export function isTransfermarktUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)transfermarkt\.(com|de|us|co\.uk|es|fr|it|pt|nl|be|at|ch|com\.tr|pl|cz|ru)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function parseTransfermarktProfile(html: string, sourceUrl: string): TransfermarktProfile {
  const header = capture(html, /(<header class="data-header"[\s\S]*?<\/header>)/i) || html;
  const headline = capture(header, /<h1[^>]*data-header__headline-wrapper[^>]*>([\s\S]*?)<\/h1>/i);
  const number = text(capture(headline, /data-header__shirt-number[^>]*>([\s\S]*?)<\/span>/i)).replace(/^#/, "");
  const name = text(headline.replace(/<span[^>]*data-header__shirt-number[^>]*>[\s\S]*?<\/span>/i, ""));
  const image = absoluteImage(capture(header, /<img[^>]*src="([^"]+)"[^>]*data-header__profile-image/i));
  const clubBox = capture(header, /(<div class="data-header__box--big">[\s\S]*?<\/div>\s*<div class="data-header__profile-container">)/i);
  const clubId = capture(clubBox, /\/verein\/(\d+)/i);
  const leagueLink = capture(clubBox, /<a[^>]*data-header__league-link[^>]*>([\s\S]*?)<\/a>/i);
  const leagueImage = absoluteImage(capture(leagueLink, /<img[^>]*src="([^"]+)"/i));
  const birth = dataHeaderValue(header, "Date of birth/Age:");
  const birthParts = birth.match(/^(.*?)\s*\((\d+)\)$/);
  const nationalBlock = capture(header, /(?:Current|Former) International:[\s\S]*?<span[^>]*data-header__content[^>]*>([\s\S]*?)<\/span>/i);
  const capsBlock = capture(header, /Caps\/Goals:([\s\S]*?)<\/li>/i);
  const marketBlock = capture(header, /data-header__market-value-wrapper[^>]*>([\s\S]*?)<\/a>/i);
  const marketValue = text(marketBlock.replace(/<p[\s\S]*$/i, "")).replace(/\s+/g, "");
  const lastUpdate = text(capture(marketBlock, /data-header__last-update[^>]*>([\s\S]*?)<\/p>/i)).replace(/^Last update:\s*/i, "");
  const joined = text(capture(clubBox, /Joined:\s*<span[^>]*data-header__content[^>]*>([\s\S]*?)<\/span>/i));
  const contract = text(capture(clubBox, /Contract expires:\s*<span[^>]*data-header__content[^>]*>([\s\S]*?)<\/span>/i));

  return {
    ...EMPTY_PROFILE,
    sourceUrl,
    name,
    number,
    playerImage: image.replace("/portrait/header/", "/portrait/big/"),
    clubLogo: clubId ? `https://tmssl.akamaized.net/images/wappen/big/${clubId}.png` : "",
    leagueLogo: leagueImage.replace("/images/logo/verytiny/", "/images/logo/header/"),
    club: text(capture(clubBox, /data-header__club[^>]*>([\s\S]*?)<\/span>/i)),
    league: text(leagueLink),
    marketValue,
    birthDate: birthParts?.[1]?.trim() ?? birth,
    age: birthParts?.[2] ?? "",
    birthPlace: dataHeaderValue(header, "Place of birth:"),
    citizenship: dataHeaderValue(header, "Citizenship:"),
    height: dataHeaderValue(header, "Height:"),
    position: dataHeaderValue(header, "Position:"),
    foot: infoTableValue(html, "Foot:"),
    agent: dataHeaderValue(header, "Agent:") || infoTableValue(html, "Player agent:"),
    nationalTeam: text(nationalBlock),
    capsGoals: text(capsBlock).replace(/\s*\/\s*/, " / "),
    contract: contract || infoTableValue(html, "Contract expires:"),
    joined,
    lastUpdate,
  };
}
