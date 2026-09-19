import { prisma } from "./client.js";

export type SettingKey = "applicantName";

export async function getSetting(key: SettingKey): Promise<string | null> {
  return (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
