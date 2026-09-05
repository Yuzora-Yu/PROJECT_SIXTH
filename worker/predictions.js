import {
  predictionCatalogRelease,
  rawPredictionCatalog,
} from "./prediction-catalog.generated.js";

const categoryLabels = Object.freeze({
  SPORTS: "スポーツ",
  ENTERTAINMENT: "エンタメ",
  ACADEMIA: "学術",
  SCIENCE: "科学",
  ARTS: "芸術",
  POLITICS: "政治",
  ECONOMY: "経済",
  TECH: "テクノロジー",
  OTHER: "その他",
});
const horizonValues = new Set(["SHORT", "MEDIUM", "MONTHLY", "LONG"]);
const optionIds = ["A", "B", "C", "D"];

function validateRelease() {
  if (
    predictionCatalogRelease.contractId !== "PROJECT_SIXTH_PREDICTION_OPS" ||
    predictionCatalogRelease.schemaVersion !== "2.0.0" ||
    !/^\d+\.\d+\.\d+$/.test(predictionCatalogRelease.releaseVersion)
  )
    throw new Error("予測カタログの運用契約を確認してください。");
}

function validate(item) {
  if (!/^PRED-\d{8}-\d{3}$/.test(item.id))
    throw new Error(`予測IDが不正です: ${item.id}`);
  if (!Number.isInteger(item.version) || item.version < 1)
    throw new Error(`予測versionが不正です: ${item.id}`);
  if (!categoryLabels[item.category])
    throw new Error(`予測categoryが不正です: ${item.id}`);
  if (!horizonValues.has(item.horizon))
    throw new Error(`予測horizonが不正です: ${item.id}`);
  if (!item.question || item.question.length > 240)
    throw new Error(`予測本文が不正です: ${item.id}`);
  if (
    !Array.isArray(item.choices) ||
    item.choices.length < 2 ||
    item.choices.length > optionIds.length ||
    new Set(item.choices).size !== item.choices.length ||
    item.choices.some((choice) => !choice)
  )
    throw new Error(`予測選択肢が不正です: ${item.id}`);
  if (!item.resolutionRule)
    throw new Error(`予測判定方法が不正です: ${item.id}`);
  const publishAt = Date.parse(item.publishAt);
  const closeAt = Date.parse(item.closeAt);
  const resultDueAt = Date.parse(item.resultDueAt);
  if (![publishAt, closeAt, resultDueAt].every(Number.isFinite))
    throw new Error(`予測日時が不正です: ${item.id}`);
  if (!(publishAt < closeAt && closeAt < resultDueAt))
    throw new Error(`予測日時の順序が不正です: ${item.id}`);
  if (!item.source?.name || !/^https:\/\//.test(item.source.url))
    throw new Error(`予測情報源が不正です: ${item.id}`);
  if (
    item.finalResult != null &&
    !optionIds.slice(0, item.choices.length).includes(item.finalResult)
  )
    throw new Error(`予測結果が不正です: ${item.id}`);
}

validateRelease();
export const predictionCatalogVersion = predictionCatalogRelease.releaseVersion;
export const predictionCategories = categoryLabels;
const validatedCatalog = rawPredictionCatalog.map((item) => {
  validate(item);
  return Object.freeze({
    ...item,
    choices: Object.freeze(
      item.choices.map((label, index) =>
        Object.freeze({ id: optionIds[index], label }),
      ),
    ),
    source: Object.freeze({ ...item.source }),
    finalResult: item.finalResult || null,
  });
});
const catalogKeys = validatedCatalog.map(
  (item) => `${item.id}|${item.version}`,
);
if (new Set(catalogKeys).size !== catalogKeys.length)
  throw new Error("予測IDとversionが重複しています。");
export const predictionCatalog = Object.freeze(validatedCatalog);

export const predictionKey = (item) => `${item.id}|${item.version}`;

export function predictionState(item, ms) {
  if (item.finalResult) return "settled";
  if (ms < Date.parse(item.publishAt)) return "upcoming";
  if (ms < Date.parse(item.closeAt)) return "open";
  return "closed";
}

export function findPrediction(id, version) {
  return predictionCatalog.find(
    (item) => item.id === id && item.version === Number(version),
  );
}
