const fs = require("fs");
const cheerio = require("cheerio");
const html = fs.readFileSync("public/index.html", "utf8");
const $ = cheerio.load(html);

let count = 0;
$("script").each((i, el) => {
  const inline = $(el).html();
  if (inline && inline.trim()) {
    try {
      new Function(inline);
    } catch (e) {
      console.error("Script index:", count, "SYNTAX ERROR:", e.message);
      const firstLine = inline.trim().split("\n")[0];
      const idx = html.indexOf(firstLine);
      const lineNum = html.slice(0, idx).split("\n").length;
      console.log("Starts around line in index.html:", lineNum);

      // Find exact error line inside the script
      const lines = inline.split("\n");
      for (let j = 1; j <= lines.length; j++) {
        try {
          new Function(lines.slice(0, j).join("\n") + "\n}");
        } catch (err2) {
          // continue
        }
      }
      console.log("--- First 30 lines of broken script ---");
      console.log(lines.slice(0, 35).join("\n"));
    }
    count++;
  }
});
