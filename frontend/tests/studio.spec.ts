import { test, expect } from "@playwright/test";

test("desktop studio renders, saves a new scene and exposes real Gemini settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "โปรเจกต์ทั้งหมด" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "โปรเจกต์ทั้งหมด" }).click();
  await page
    .getByRole("button", { name: /เช้าวันใหม่ เริ่มต้นได้เสมอ/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "เช้าวันใหม่ เริ่มต้นได้เสมอ" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.local/screenshots/studio-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "โปรเจกต์ทั้งหมด" }).click();
  await page.getByRole("button", { name: "สร้างโปรเจกต์ใหม่" }).click();
  await page.getByLabel("ชื่อโปรเจกต์ใหม่").fill("Browser integration test");
  await page
    .getByRole("button", { name: "สร้างโปรเจกต์", exact: true })
    .click();
  await page
    .getByLabel("บทพากย์", { exact: true })
    .fill("สวัสดี วันนี้เริ่มต้นใหม่ได้เสมอ");
  await page.getByRole("button", { name: "บันทึกฉาก" }).click();
  await expect(page.getByRole("button", { name: "บันทึกฉาก" })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("บทพากย์", { exact: true })).toHaveValue(
    "สวัสดี วันนี้เริ่มต้นใหม่ได้เสมอ",
  );
  await page.getByRole("tab", { name: "เสียง", exact: true }).click();
  await expect(
    page.getByText("Gemini 3.8 Flash TTS", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "เสียงพากย์" }).click();
  await page.getByRole("option", { name: "Puck · สดใส" }).click();
  await page.getByRole("button", { name: "บันทึกฉาก" }).click();
  await expect(page.getByRole("button", { name: "บันทึกฉาก" })).toBeDisabled();
  const health = await (await page.request.get("/api/health")).json();
  // Never make a billable request as part of the browser test suite.
  if (!health.gemini) {
    await page
      .getByRole("button", { name: "สร้างเสียงพากย์", exact: true })
      .click();
    await page.getByRole("button", { name: "ประวัติการสร้าง" }).click();
    await expect(
      page.getByRole("dialog").getByText("ไม่สำเร็จ", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("dialog").getByText(/ยังไม่มี GEMINI_API_KEY/),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("mobile studio has no page overflow and editor remains usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Browser integration test" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("tab", { name: "ภาพ", exact: true }).click();
  await expect(page.getByLabel("คำอธิบายภาพ")).toBeVisible();
  await page.screenshot({
    path: "../.local/screenshots/studio-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "โมเดลและการตั้งค่า" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("llama runtime")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("uploaded image and voice become a real downloadable MP4 through the UI", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  const data = await (await page.request.get("/api/bootstrap")).json();
  const sample = data.projects.find(
    (p: { title: string }) => p.title === "เช้าวันใหม่ เริ่มต้นได้เสมอ",
  );
  const image = await (
    await page.request.get("/api/assets/" + sample.scenes[0].image)
  ).body();
  const rate = 24000,
    samples = rate * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 880) * 1000),
      44 + i * 2,
    );
  await page.getByRole("button", { name: "โปรเจกต์ทั้งหมด" }).click();
  await page.getByRole("button", { name: "สร้างโปรเจกต์ใหม่" }).click();
  await page.getByLabel("ชื่อโปรเจกต์ใหม่").fill("Media browser test");
  await page
    .getByRole("button", { name: "สร้างโปรเจกต์", exact: true })
    .click();
  await page.getByLabel("บทพากย์", { exact: true }).fill("ทดสอบไฟล์วิดีโอจริง");
  await page.getByRole("button", { name: "บันทึกฉาก" }).click();
  await expect(page.getByRole("button", { name: "บันทึกฉาก" })).toBeDisabled();
  await page.getByRole("tab", { name: "ภาพ", exact: true }).click();
  await page
    .getByLabel("อัปโหลดภาพ", { exact: true })
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer: image });
  await expect(page.locator(".portrait-frame > img")).toBeVisible();
  await page.getByRole("tab", { name: "เสียง", exact: true }).click();
  await page
    .getByLabel("อัปโหลดเสียงพากย์", { exact: true })
    .setInputFiles({
      name: "synthetic-test-tone.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
  await expect(page.getByLabel("เสียงพากย์ฉากที่เลือก")).toBeVisible();
  await page.getByRole("tab", { name: "ซับ", exact: true }).click();
  await expect(page.getByLabel("ซับ 1 จบ")).toHaveValue("2");
  await page.getByLabel("ซับ 1 จบ").fill("1");
  await page.getByRole("button", { name: "เพิ่มช่วงซับ" }).click();
  await page.getByLabel("ข้อความซับ 2").fill("ซับช่วงที่สอง");
  await page.getByRole("button", { name: "บันทึกฉาก" }).click();
  await expect(page.getByRole("button", { name: "บันทึกฉาก" })).toBeDisabled();
  await page.getByRole("button", { name: "ส่งออกคลิป", exact: true }).click();
  await page
    .getByRole("button", { name: "ตัดต่อและสร้าง Preview", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("เสร็จแล้ว", { exact: true }).first(),
  ).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "ส่งออกคลิป", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "MP4", exact: true }).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  await download.saveAs("../.local/screenshots/browser-export.mp4");
});
