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
  1: "最初の一手を、今日は大事にしてほしい。正解を確かめるのは、そのあとでいい。",
  2: "二つの候補で迷ったら、その迷いも覚えておいてほしい。選ばなかった方が気になる日も、記録には意味がある。",
  3: "思いついた答えを、ひとまず残してみよう。あとで理由が浮かんだら、それも聞かせてほしい。",
  4: "同じ条件でもう一度試そう。繰り返して初めて見える違いを、こちらも待っている。",
  5: "いつもと違う試験を一つ選んでみてほしい。得意かどうかを決めるのは、数回試してからにしよう。",
  6: "全部をうまくやろうとしなくていい。今日は一つ、気になった変化を拾えれば十分だ。",
  7: "答えを選んだあとで、理由を考えてみよう。その順番を変えると、記録にも違いが出るかもしれない。",
  8: "結果は数字で残しておこう。ただ、一回の数字だけで今日の君を決めるつもりはない。",
  9: "ひと通り観測したら、いったん手を止めよう。最後まで気になっていたものは何だっただろう。",
  11: "理由より先に、何かが気になることがある。その感覚を急いで説明せず、まず選択だけ残してみてほしい。",
  22: "気になったことを、同じ手順でもう一度確かめよう。思いつきが再現するか、こちらも見てみたい。",
  33: "周りを見渡したあと、自分が最初に感じたことへ戻ってみよう。君自身の選択を、今日は聞きたい。",
};
const sunNotes = [
  "今日は最初の反応を記録しよう。考え直した答えとは分けておいてほしい。",
  "急がず、同じ場所を少し長く見てみよう。小さな変化にも気づけるかもしれない。",
  "二つの見方を試してみよう。どちらで気づいたかまで残せると、あとで読み返しやすい。",
  "今日は落ち着いて観測できる場所を選んでほしい。気が散った試行は、そのことも記録しておこう。",
  "気になったものを一つ指してみてほしい。こちらの顔色は見なくていい。",
  "違和感を見つけたら、どこが違ったのかも覚えておこう。答え合わせで照らし合わせたい。",
  "迷った候補を二つ残してみよう。最後に選んだ理由まで、急いで整えなくていい。",
  "一度気になった場所を、もう少しだけ観測しよう。何も起こらなかった記録も捨てないでほしい。",
  "少し広く見渡してから選んでみよう。いつもと違う見方をした試行には、印をつけておきたい。",
  "今日も同じ条件で始めよう。前回との差は、結果がそろってから確かめればいい。",
  "いつもの説明が合わないときは、そのまま残そう。無理に一つの法則へまとめなくていい。",
  "輪郭がはっきりしない感覚も、選択には残せる。言葉にするのはあとからで構わない。",
];
export const mbtiNotes = {
  INTJ: "先に立てた予想を、観測後の説明と分けておこう。違っていた部分も残してほしい。",
  INTP: "規則を見つけたら、例外がないか一度だけ確かめよう。考え続ける時間にも区切りを置いてみてほしい。",
  ENTJ: "試す順番は君に任せる。始める前に、何を確かめたいか一つ決めておこう。",
  ENTP: "別の仮説が浮かんだら、次の試行へ取っておこう。一回の途中では条件をそろえたい。",
  INFJ: "まだ言葉にならない予想も、そのまま記録していい。答え合わせのあとで聞かせてほしい。",
  INFP: "正しそうな答えより、最初に気になった答えを残す回を作ろう。二つは分けて見ておきたい。",
  ENFJ: "こちらが期待する答えはない。今回は、君が気になったものをそのまま選んでほしい。",
  ENFP: "新しい試験を選ぶ前に、同じものをもう一回だけ試そう。初回との差を見ておきたい。",
  ISTJ: "いつもの手順で始めよう。途中で条件が変わったら、それだけ記録しておいてほしい。",
  ISFJ: "無理のないペースで続けよう。調子のよい日だけでなく、普通の日の記録も欲しい。",
  ESTJ: "結果をそろえてから比べよう。一回ごとの良し悪しは、いったん脇へ置いておいてほしい。",
  ESFJ: "他の被験者の結果を見る前に、自分の感触を残しておこう。その順番を大切にしたい。",
  ISTP: "まず一度触って確かめてみよう。動きが分かったら、次は同じ条件で観測したい。",
  ISFP: "気になった場所を一つ選ぼう。うまく説明できなくても、それで試験は進められる。",
  ESTP: "最初の反応の速さを見ておこう。速く押せたかと、何を見つけたかは別々に記録したい。",
  ESFP: "今日の感触を短く残してみよう。楽しかった回と難しかった回、どちらもあとで読んでみたい。",
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
    method: "生年月日の数字をすべて足し、11・22・33に達したら残す方式。",
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
        ? "太陽は星座の境界付近にある。出生時刻が分かるまでは、どちらか一方に決めずにおこう。"
        : sunNotes[Math.floor(sun.longitude / 30)],
    moonNote:
      moon.possibleSigns.length > 1
        ? "この日は月の星座が変わる。出生時刻が分かれば、もう少し絞り込める。"
        : "月の位置も残しておこう。試験の結果とは分けて眺めてほしい。",
  };
}
export function observedComment(stats, history) {
  if (!history.length)
    return "まだ観測記録がない。まず一度、気になったものを選んでみてほしい。";
  const key = config.senses.reduce((a, b) => (stats[a] >= stats[b] ? a : b));
  const tied = config.senses.filter((k) => stats[k] === stats[key]).length;
  if (history.length < 5)
    return "最初の記録を受け取った。まだ傾向を決めるには早い。同じ条件でもう少し観測を続けよう。";
  return tied > 1
    ? "今の研究値は、いくつかの軸で並んでいる。得意を急いで決めず、次の記録も見てみよう。"
    : `今の研究値では、${config.labels[key]}が一歩先に出ている。受けた試験の種類にもよるから、次は別の試験と見比べてみよう。`;
}
export function trialComment(test, result) {
  if (test === "card")
    return result.correct
      ? "星の位置と、君の選択が重なった。今日の一回として残しておこう。"
      : "今回は星の位置と違った。外れた記録も必要だ。選んだ感触は覚えておいてほしい。";
  if (test === "pattern")
    return result.correct >= 4
      ? "かなり規則を拾えていた。分かったつもりになる前に選べた問があれば、そこも覚えておこう。"
      : "気になった並びを、答え合わせでもう一度見てみよう。どこから違って見えたかを知りたい。";
  if (result.falsePositives > result.found)
    return "指摘した回数に比べて、誤検知が多かった。次は少しだけ待って、動きの続きも見てみよう。";
  return result.found
    ? "いくつかの変化を捉えられた。答え合わせで、押す少し前の動きにも目を向けてみてほしい。"
    : "今回は異常を記録できなかった。答え合わせで一つ見つけてから、同じ見方を試してみよう。";
}
