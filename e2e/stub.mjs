// OpenAI-compatible stub standing in for api.deepseek.com/v1 — records requests, returns realistic vision answers
// (authored by visually inspecting the two test images) including deliberate rule violations.
import http from "node:http";
import fs from "node:fs";

let templateCalls = 0;
const log = [];

const single = {
  content_type: "single_asset",
  description: "A beautiful smooth abstract gradient blending deep navy blue, violet purple and pink with subtle grain.",
  platforms: {
    adobe: { title: "Smooth navy blue, purple and pink gradient background with soft grain", description: "Abstract gradient backdrop blending navy, purple and pink.", keywords: ["gradient","background","abstract","navy","purple","pink","blue","violet","smooth","blurred","grain","noise","soft","color","colorful","vibrant","wallpaper","backdrop","banner","website","presentation","social media","cover","copy space","digital","screen","modern","dreamy","template","beautiful","HD","Gradients"], category: "Graphic Resources" },
    shutterstock: { title: "Smooth abstract gradient background blending deep navy blue, violet purple and pink with subtle grain texture, ideal as wallpaper, banner or presentation backdrop", description: "", keywords: ["gradient","background","abstract","navy","purple","pink","blue","violet","smooth","blurred","grain","soft","colorful","vibrant","wallpaper","backdrop","banner","website","presentation","social media","cover","copy space","digital","modern","dreamy","night"], category: "Backgrounds/Textures" },
    freepik: { title: "Navy blue, purple and pink smooth gradient background with grain", description: "Abstract grainy gradient backdrop.", keywords: ["gradient","background","abstract","navy","purple","pink","blue","violet","smooth","grain","soft","wallpaper","backdrop","banner","website","presentation","social media","cover","copy space","modern"], category: "Backgrounds" },
    istock: { title: "Abstract smooth gradient background in navy blue, violet purple and pink", description: "Smooth abstract gradient with subtle grain blending navy blue, violet purple and pink, usable as wallpaper or backdrop.", keywords: ["gradient","background","abstract","navy blue","purple","pink","violet","smooth","grain","wallpaper","backdrop","banner","presentation","copy space","modern"], category: "Backgrounds" },
  },
  category_suggestion: "Backgrounds/Textures",
  flags: [],
};

const tplPlatforms = (ssTitle) => ({
  adobe: { title: "Abstract poster templates set with flowing waves, glowing 3D spheres, mesh lines and geometric bars in blue gradient for covers and flyers", description: "Blue gradient geometric poster templates with editable text headlines.", keywords: ["poster","template","vector","abstract","blue","gradient","set","collection","cover","layout","flier","booklet","banner","print","presentation","geometric","waves","sphere","3d","mesh","grid","lines","glowing","futuristic","technology","digital","modern","corporate","business","editable text","cyan","purple","wallpaper","background","brochure","annual report","magazine","design"], category: "Backgrounds" },
  shutterstock: { title: ssTitle, description: "", keywords: ["poster","template","vector","abstract","blue","gradient","set","collection","cover","layout","flier","booklet","banner","print","presentation","geometric","waves","sphere","3d","mesh","grid","lines","glowing","futuristic","technology","digital","modern","corporate","business","cyan"], category: "Backgrounds/Textures" },
  freepik: { title: "Blue gradient poster templates with waves, 3D spheres and mesh lines", description: "Poster template set.", keywords: ["poster","template","vector","abstract","blue","gradient","set","collection","cover","layout","flier","banner","print","geometric","waves","sphere","mesh","glowing","technology","modern"], category: "Templates" },
  istock: { title: "Abstract blue gradient poster templates with waves, 3D spheres, mesh grid and bars", description: "Set of four vector poster templates with blue gradient geometric compositions and editable text placeholders.", keywords: ["poster","template","vector","abstract","blue","gradient","set","cover","layout","banner","print","geometric","waves","sphere","mesh","technology","modern","corporate"], category: "Graphic Resources" },
});

const templateBroken = { content_type: "template_pack", description: "Four poster templates.", platforms: { adobe: tplPlatforms("").adobe }, category_suggestion: "Graphic Resources", flags: [] };
const template = {
  content_type: "template_pack",
  description: "Set of four vertical poster templates with blue gradient geometric compositions — flowing waves, glowing 3D spheres, wireframe mesh grids and geometric bars — each with a headline and body text placeholder. The text is editable.",
  platforms: tplPlatforms("Abstract poster templates set. Blue gradient geometric covers with flowing waves, glowing 3D spheres, mesh lines and bars, editable text for flyers and brochures"),
  category_suggestion: "Backgrounds/Textures",
  flags: ["vector illustration", "contains text"],
};

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const user = j.messages?.find((m) => m.role === "user");
    const text = Array.isArray(user?.content) ? user.content.find((c) => c.type === "text")?.text : user?.content;
    const img = Array.isArray(user?.content) ? user.content.find((c) => c.type === "image_url")?.image_url?.url : null;
    log.push({ path: req.url, auth: req.headers.authorization, model: j.model, response_format: j.response_format, turns: j.messages.length, systemHasBranches: /BRANCH 1 — single_asset/.test(j.messages[0].content) && /BRANCH 2 — template_pack/.test(j.messages[0].content), userText: text, imagePrefix: img?.slice(0, 30), imageChars: img?.length });
    fs.writeFileSync("requests.json", JSON.stringify(log, null, 2));
    const last = j.messages[j.messages.length - 1];
    const lastText = typeof last.content === "string" ? last.content : "";
    let answer;
    if (/exceed the character ceiling/.test(lastText)) answer = JSON.stringify({ titles: { adobe: "Blue poster templates set with waves, glowing spheres and mesh lines" } });
    else if (/Ping/.test(text ?? "")) answer = "OK";
    else if (/template-poster/.test(text)) answer = templateCalls++ === 0 ? JSON.stringify(templateBroken) : "```json\n" + JSON.stringify(template) + "\n```";
    else answer = JSON.stringify(single);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: answer } }] }));
  });
}).listen(4555, () => console.log("stub on 4555"));
