import { Ecliptic, GeoVector } from "../vendor/astronomy.js";
import { astrology } from "./core.js";
import { config } from "./config.js";
import {
  calculateProfile,
  profileReading,
  profileRuleVersion,
  numberVectors,
} from "./profile-model.js";
export const zodiacNames = [
  "牡羊座",
  "牡牛座",
  "双子座",
  "蟹座",
  "獅子座",
  "乙女座",
  "天秤座",
  "蠍座",
  "射手座",
  "山羊座",
  "水瓶座",
  "魚座",
];
const bodies = [
  ["Sun", "太陽", "☉"],
  ["Moon", "月", "☽"],
  ["Mercury", "水星", "☿"],
  ["Venus", "金星", "♀"],
  ["Mars", "火星", "♂"],
  ["Jupiter", "木星", "♃"],
  ["Saturn", "土星", "♄"],
  ["Uranus", "天王星", "♅"],
  ["Neptune", "海王星", "♆"],
  ["Pluto", "冥王星", "♇"],
];
const numberNotes = {
  1: "今日は、最初の一手を記録してほしい。正否を確かめるのは、そのあとで構わない。",
  2: "候補を二つまで絞って迷ったなら、その迷いも覚えておいてほしい。選ばなかった方が気になった理由も、記録に値する。",
  3: "思いついた答えを、まず記録しておこう。理由があとから浮かんだなら、それも分けて残してほしい。",
  4: "同じ条件でもう一度試してほしい。繰り返すことで初めて見える違いがある。",
  5: "今日は、普段とは違う試験を一つ選んでほしい。適性の判断は、数回分の記録がそろってからでよい。",
  6: "すべてを整えようとしなくていい。今日は一つ、気になった変化を拾えれば十分だ。",
  7: "答えを選んでから、その理由を考えてみよう。判断と説明を分けることで、記録の癖が見えやすくなる。",
  8: "結果は数字として残しておこう。一回の数値だけで、君の傾向を決めるつもりはない。",
  9: "ひと通り観測したら、いったん手を止めてほしい。最後まで気になっていた対象を、短く記録しておこう。",
  11: "理由より先に何かが気になることはある。その感触を急いで説明せず、まず選択として残してほしい。",
  22: "気になったことを、同じ手順でもう一度確かめよう。同じ感触が再現するか、記録を並べて確認したい。",
  33: "周囲を見渡したあと、自分が最初に感じたことへ戻ってほしい。今日は、君自身の選択を記録しよう。",
};
const sunNotes = [
  "今日は最初の反応を記録しよう。考え直したあとの答えとは分けて残してほしい。",
  "急がず、同じ対象を少し長く見てほしい。小さな変化を拾えるか確認しよう。",
  "二つの見方を試してみよう。どちらで気づいたかまで残すと、あとで比較しやすい。",
  "落ち着いて観測できる場所を選んでほしい。注意が逸れた試行は、その事実も記録しておこう。",
  "最初に気になったものを一つ選んでほしい。判断の理由は、選んだあとで整理すればよい。",
  "違和感を覚えたら、どこが違って見えたかも覚えておいてほしい。答え合わせの際に照合しよう。",
  "迷った候補は二つとも残してほしい。最後に選んだ理由は、すぐに整えなくても構わない。",
  "一度気になった場所を、もう少し観測しよう。変化がなかったという記録も必要だ。",
  "対象全体を見渡してから選んでほしい。普段と違う見方をしたことも、覚えておいてほしい。",
  "今日も同じ条件から始めよう。前回との差は、結果がそろってから確かめればよい。",
  "これまでの説明に合わない反応は、そのまま残してほしい。複数の可能性を保ったまま観測を続けよう。",
  "輪郭の曖昧な感触も、選択として記録できる。言葉にするのはあとで構わない。",
];
export const mbtiNotes = {
  INTJ: "事前の予想と、観測後に組み立てた説明を分けて残してほしい。食い違った部分も重要な記録になる。",
  INTP: "規則を見つけたら、例外がないか一度確かめよう。考える時間にも区切りを設けてほしい。",
  ENTJ: "試す順番は君に任せる。開始前に、確かめたいことを一つだけ決めておこう。",
  ENTP: "別の仮説が浮かんだら、次の試行用に記録しておこう。一回の試行中は条件をそろえてほしい。",
  INFJ: "まだ言葉にならない予想も、そのまま記録してよい。答え合わせのあとで、説明を加えてほしい。",
  INFP: "正しそうに思う答えと、最初に気になった答えを分けて残してほしい。両者の違いを観測しよう。",
  ENFJ: "この試験に、こちらが期待する答えはない。君が気になったものをそのまま選んでほしい。",
  ENFP: "新しい試験へ移る前に、同じ試験をもう一度行おう。初回との差を確認したい。",
  ISTJ: "いつもの手順で始めよう。途中で条件が変わった場合は、その時点を記録してほしい。",
  ISFJ: "無理のないペースで続けよう。調子のよい日だけでなく、普段どおりの日の記録も必要だ。",
  ESTJ: "結果がそろってから比較しよう。一回ごとの出来については、いったん評価を保留してほしい。",
  ESFJ: "ほかの被験者の結果を見る前に、自分の感触を残してほしい。観測の順序をそろえておこう。",
  ISTP: "まず一度、実際に試してみよう。動きが分かったら、次は同じ条件で観測してほしい。",
  ISFP: "最初に気になった場所を一つ選んでほしい。理由をうまく説明できなくても、記録としては十分だ。",
  ESTP: "最初の反応時間を記録しよう。押すまでの速さと、何を見つけたかは分けて評価したい。",
  ESFP: "今日の感触を短く残してほしい。手応えがあった回も難しかった回も、同じように記録しよう。",
};
export function numerologyProfile(birthDate) {
  const a = astrology(birthDate);
  return {
    ...a,
    stats: Object.fromEntries(
      config.senses.map((k, i) => [k, numberVectors[a.life][i]]),
    ),
    label: [11, 22, 33].includes(a.life)
      ? `${a.life} / マスターナンバー`
      : String(a.life),
    comment: numberNotes[a.life],
    method:
      "生年月日の各桁を加算し、11・22・33に達した場合はその値を残す方式。",
  };
}
export function combinedProfile(
  birthDate,
  birthTime = "",
  utcOffset = 9,
  mbti = "",
) {
  const numerology = numerologyProfile(birthDate),
    sky = planetaryProfile(birthDate, birthTime, utcOffset);
  const model = calculateProfile({
    version: profileRuleVersion,
    life: numerology.life,
    mbti,
    signs: sky.planets.map((p) =>
      p.possibleSigns.length === 1 ? zodiacNames.indexOf(p.sign) : null,
    ),
  });
  return { ...model, numerology, sky, reading: profileReading(model) };
}
const longitude = (body, date) => Ecliptic(GeoVector(body, date, true)).elon;
export function planetaryProfile(birthDate, birthTime = "", utcOffset = 9) {
  astrology(birthDate);
  const year = Number(birthDate.slice(0, 4));
  if (year < 1800 || year > 2100)
    throw new Error("惑星配置の表示範囲は1800〜2100年です。");
  if (birthTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime))
    throw new Error("出生時刻を確認してください。");
  const offset = Number(utcOffset);
  if (
    !Number.isFinite(offset) ||
    offset < -12 ||
    offset > 14 ||
    (offset * 4) % 1 !== 0
  )
    throw new Error("UTC差は−12〜+14の範囲で入力してください。");
  const start = Date.parse(`${birthDate}T00:00:00Z`) - offset * 3600000;
  const time =
    Date.parse(`${birthDate}T${birthTime || "12:00"}:00Z`) - offset * 3600000;
  const planets = bodies.map(([body, name, symbol]) => {
    const angle = longitude(body, new Date(time));
    const sign = Math.floor(angle / 30);
    const range = birthTime
      ? [sign]
      : [
          ...new Set(
            [0, 6, 12, 18, 24].map((hour) =>
              Math.floor(
                longitude(body, new Date(start + hour * 3600000)) / 30,
              ),
            ),
          ),
        ];
    return {
      body,
      name,
      symbol,
      longitude: angle,
      sign: zodiacNames[sign],
      degree: angle % 30,
      possibleSigns: range.map((i) => zodiacNames[i]),
    };
  });
  const sun = planets[0],
    moon = planets[1];
  const aspects = [];
  // Without birth time, Moon aspects are too time-sensitive for a single report.
  for (let i = 0; i < planets.length; i++)
    for (let j = i + 1; j < planets.length; j++) {
      if (!birthTime && (i === 1 || j === 1)) continue;
      const raw = Math.abs(planets[i].longitude - planets[j].longitude),
        distance = Math.min(raw, 360 - raw);
      for (const [angle, label] of [
        [0, "合"],
        [60, "六分"],
        [90, "矩"],
        [120, "三分"],
        [180, "衝"],
      ])
        if (Math.abs(distance - angle) <= 4)
          aspects.push({
            label,
            bodyA: planets[i].name,
            bodyB: planets[j].name,
            orb: Math.abs(distance - angle),
          });
    }
  return {
    planets,
    aspects: aspects.sort((a, b) => a.orb - b.orb).slice(0, 5),
    approximate: !birthTime,
    utcOffset: offset,
    comment:
      sun.possibleSigns.length > 1
        ? "太陽は星座の境界付近にある。出生時刻が分かるまでは、候補を二つとも残しておこう。"
        : sunNotes[Math.floor(sun.longitude / 30)],
    moonNote:
      moon.possibleSigns.length > 1
        ? "この日は、月が別の星座へ移る。出生時刻が分かれば、位置を絞り込める。"
        : "月の位置と試験結果は別々に記録し、あとで傾向を照合したい。",
  };
}
export function observedComment(stats, history) {
  if (!history.length)
    return "観測記録はまだない。まずは一度、最初に気になったものを選んでほしい。";
  const key = config.senses.reduce((a, b) => (stats[a] >= stats[b] ? a : b));
  const tied = config.senses.filter((k) => stats[k] === stats[key]).length;
  if (history.length < 5)
    return "最初の記録を確認した。現段階で傾向を判断するのは早い。同じ条件で、もう少し観測を続けよう。";
  return tied > 1
    ? "現在の研究値は、複数の軸が同じ水準にある。得意分野の判断は保留し、もう数回分の記録を確認したい。"
    : `現在の研究値では、${config.labels[key]}が先行している。受けた試験の種類による影響もあるため、別の試験結果と照合したい。`;
}
export function trialComment(test, result) {
  if (test === "card")
    return result.correct
      ? "星の位置と君の選択が一致した。本日の一試行として記録しておこう。"
      : "今回は星の位置と一致しなかった。これも必要な観測記録だ。選んだときの感触を覚えておいてほしい。";
  if (result.falsePositives > result.found)
    return "検出数より誤検知の方が多かった。次は判断までにひと呼吸置き、動きの続きも観察してほしい。";
  return result.found
    ? "複数の変化を捉えた。答え合わせでは、押す直前の動きにも注目してほしい。"
    : "今回は異常を捉えられなかった。答え合わせで動きを一つ確認し、その見方を次の試行で試そう。";
}
