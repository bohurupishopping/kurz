export interface UAInfo {
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop" | "bot";
  isBot: boolean;
  isPreviewBot: boolean;
}

const PREVIEW_BOTS =
  /facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|whatsapp|telegrambot|skypeuripreview|pinterest|redditbot|applebot|embedly|iframely|mastodon|bluesky|vkshare|w3c_validator|googlebot|bingbot|yandex|duckduckbot/i;
const BOTS =
  /bot\b|bot\/|crawler|spider|crawling|scraper|curl\/|wget\/|python-requests|python-urllib|httpclient|okhttp|go-http-client|axios\/|node-fetch|undici|headlesschrome|phantomjs|lighthouse|pingdom|uptimerobot|monitor|preview|fetcher|validator|^$/i;

export function parseUA(ua: string | null | undefined): UAInfo {
  const s = ua ?? "";
  const isPreviewBot = PREVIEW_BOTS.test(s);
  const isBot = isPreviewBot || BOTS.test(s);

  let os = "Other";
  if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  let browser = "Other";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";

  let device: UAInfo["device"] = "desktop";
  if (isBot) device = "bot";
  else if (/iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(s)) device = "mobile";

  return { browser, os, device, isBot, isPreviewBot };
}
