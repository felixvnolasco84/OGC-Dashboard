import { readFile } from "node:fs/promises";
import { scoreAssistantEval } from "./assistant-eval-cases.mjs";

const [lowPath, mediumPath] = process.argv.slice(2);
if (!lowPath || !mediumPath) {
  console.error("Uso: npm run eval:chatbot -- resultados-low.json resultados-medium.json");
  process.exit(1);
}

const [low, medium] = await Promise.all([
  readFile(lowPath, "utf8").then(JSON.parse),
  readFile(mediumPath, "utf8").then(JSON.parse),
]);
const lowScore = scoreAssistantEval(low);
const mediumScore = scoreAssistantEval(medium);
const improvement = mediumScore.composite - lowScore.composite;
const promoteMedium = improvement >= 0.05 && mediumScore.valid_json >= lowScore.valid_json;

console.table({ low: lowScore, medium: mediumScore });
console.log(promoteMedium
  ? "Promover medium: mejora medible de al menos 5 puntos sin regresión de JSON válido."
  : "Mantener low: medium no supera el umbral de promoción.");
