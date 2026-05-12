const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const datasetsDir = path.join(process.cwd(), "web", "datasets");
    const entries = await fs.readdir(datasetsDir, { withFileTypes: true });

    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase().endsWith(".json") && name.toLowerCase() !== "index.json")
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
    return res.status(200).json({ files });
  } catch (err) {
    return res.status(500).json({ error: "No se pudo listar datasets", detail: String(err) });
  }
};
