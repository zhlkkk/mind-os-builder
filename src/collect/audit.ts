import { readFile, stat } from "node:fs/promises"; import { MindosError, resolveReadPath } from "../lib/paths.js";

export type TwitterQualityIssueCode = "twitter.marker.duplicate" | "twitter.marker.orphan" | "twitter.marker_url.mismatch" | "twitter.frontmatter.count" | "twitter.display.missing_chinese" | "twitter.display.shortlink" | "twitter.display.duplicate" | "twitter.display.template" | "twitter.expected.missing" | "twitter.discarded.present";
export type TwitterQualityIssue = { code: TwitterQualityIssueCode; id?: string }; export type TwitterQualityReport = { valid: boolean; managed_count: number; unique_ids: number; legacy_count: number; managed_ids: string[]; issues: TwitterQualityIssue[] }; const markerPattern = /^<!-- mindos:collect:twitter:([\w.:-]+) -->$/u; const entryPattern = /^\d+\. \*\*(.+)\*\*：(.+)$/u; const sourcePattern = /^ {3}— \[@(?:[A-Za-z0-9]|\\_){1,100}\]\(<(https:\/\/[^>\s]+)>\)$/u;
const legacyPattern = /https:\/\/x\.com\/[^/\s)>]+\/status\/(\d+)/gu; const bareShortlink = /^(?:[\s\p{Extended_Pictographic}\uFE0F]*)https:\/\/t\.co\/[A-Za-z0-9]+$/u; const titleTemplate = /^(?:关于.{1,400}的(?:探讨|讨论)[：:]?|(?:探讨|讨论|分享|解读)[：:])/u; const summaryTemplate = /^(?:(?:作者)?(?:分享|介绍)了?如下内容[：:]|(?:核心)?要点(?:如下)?[：:])/u;

export type TwitterAuditExpectation = { kept: ReadonlyMap<string, string | undefined>; discarded: ReadonlySet<string> }; export class TwitterQualityError extends MindosError { public constructor(public readonly report: TwitterQualityReport) { super("mindos.state.conflict", "Twitter daily digest failed quality audit"); } }
export function auditTwitterDaily(content: string, expected?: TwitterAuditExpectation): TwitterQualityReport {
  const lines = content.split("\n"); const issues: TwitterQualityIssue[] = []; const issueKeys = new Set<string>(); const ids = new Set<string>(); const allStatusIds = new Set<string>();
  const addIssue = (code: TwitterQualityIssueCode, id?: string): void => { const key = `${code}\0${id ?? ""}`; if (!issueKeys.has(key)) { issueKeys.add(key); issues.push({ code, ...(id === undefined ? {} : { id }) }); } };
  let fence: { character: "`" | "~"; length: number } | undefined; let managedCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""; const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (fence !== undefined) { if (fenceMatch !== undefined && fenceMatch[0] === fence.character && fenceMatch.length >= fence.length && /^\s*(?:`+|~+)\s*$/u.test(line)) fence = undefined; continue; }
    if (fenceMatch !== undefined) { fence = { character: fenceMatch[0] as "`" | "~", length: fenceMatch.length }; continue; }
    const marker = line.match(markerPattern);
    if (marker?.[1] === undefined) { for (const match of line.matchAll(legacyPattern)) allStatusIds.add(match[1] ?? ""); continue; }
    const id = marker[1]; const entry = (lines[index + 1] ?? "").match(entryPattern); const source = (lines[index + 2] ?? "").match(sourcePattern);
    if (entry?.[1] === undefined || entry[2] === undefined || source?.[1] === undefined) { addIssue("twitter.marker.orphan", id); continue; }
    managedCount += 1; if (ids.has(id)) addIssue("twitter.marker.duplicate", id); ids.add(id); const title = entry[1].trim(); const summary = entry[2].trim(); const statusId = source[1].match(/^https:\/\/x\.com\/[^/\s]+\/status\/(\d+)/u)?.[1];
    if (/^\d+$/u.test(id) && statusId !== undefined && id !== statusId) addIssue("twitter.marker_url.mismatch", id);
    if (!/\p{Script=Han}/u.test(title) || !/\p{Script=Han}/u.test(summary)) addIssue("twitter.display.missing_chinese", id);
    if (bareShortlink.test(title) || bareShortlink.test(summary)) addIssue("twitter.display.shortlink", id);
    if (title === summary && title.length <= 40) addIssue("twitter.display.duplicate", id);
    if (titleTemplate.test(title) || summaryTemplate.test(summary)) addIssue("twitter.display.template", id); index += 2;
  }
  allStatusIds.delete(""); const legacyCount = [...allStatusIds].filter((id) => !ids.has(id)).length;
  const expectedCount = ids.size + legacyCount; const declared = content.match(/^tweet_count: (\d+)$/mu);
  if (declared?.[1] === undefined || Number(declared[1]) !== expectedCount) addIssue("twitter.frontmatter.count");
  if (expected !== undefined) { for (const [id, legacyId] of expected.kept) if (!ids.has(id) && (legacyId === undefined || !allStatusIds.has(legacyId))) addIssue("twitter.expected.missing", id); for (const id of expected.discarded) if (ids.has(id)) addIssue("twitter.discarded.present", id); }
  return { valid: issues.length === 0, managed_count: managedCount, unique_ids: ids.size, legacy_count: legacyCount, managed_ids: [...ids], issues };
}
export function twitterDailyEntryCount(content: string): number { const report = auditTwitterDaily(content); return report.unique_ids + report.legacy_count; }
export function assertTwitterQuality(report: TwitterQualityReport): void { if (!report.valid) throw new TwitterQualityError(report); }
export async function auditTwitterTarget(root: string, relative: string): Promise<TwitterQualityReport> { const path = await resolveReadPath(root, relative); let bytes: Buffer;
  try { if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error(); bytes = await readFile(path); } catch { throw new MindosError("mindos.state.conflict", "Twitter daily digest is missing or too large"); }
  try { return auditTwitterDaily(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new MindosError("mindos.state.conflict", "Twitter daily digest is not valid UTF-8"); } }
