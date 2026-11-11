import { ruleContext } from "./payments/access";
import { isGuestPreview } from "./payments/preview-access";
import { attributeRules } from "../shared/rules/growth";
import { textLimits, checkTextLength } from "./text-limits";
import { NumberInput } from "./inputs/ValueInputs";
import { useEffect, useLayoutEffect, useRef, useId, useState } from "react";
import { CircleHelp } from "lucide-react";
import { type State, templates } from "./model";
import { saveCard } from "./engine";
import { Dialog, Field } from "./components";
import { InitialLevelCurve } from "./InitialLevelCurve";
import { animateSafely } from "./ui-layout/animation";
import { useMotionAllowed } from "./ui-layout/useMotionAllowed";
import {
  type ProfileDraft,
  readProfileDraft,
  writeProfileDraft,
  removeProfileDraft,
} from "./local-data/profile-draft";
import { currentDraftEpoch } from "./local-data/draft-epoch";
// Numerical integration of the displayed, truncated N(50,17²) illustration.
export function illustrativePercentile(value: number) {
  const f = (n: number) => Math.exp(-0.5 * ((n - 50) / 17) ** 2);
  let all = 0,
    left = 0;
  for (let i = 0; i < 1000; i++) {
    const x = (i + 0.5) / 10,
      w = f(x);
    all += w;
    if (x < value) left += w;
  }
  return Math.round((1000 * left) / all) / 10;
}
export function StepProgress({
  labels,
  step,
}: {
  labels: string[];
  step: number;
}) {
  return (
    <ol className="wizard-progress" aria-label="填写进度">
      {labels.map((label, i) => (
        <li
          key={i}
          className={i === step ? "current" : i < step ? "done" : ""}
          aria-current={i === step ? "step" : undefined}
        >
          <span>{i + 1}</span>
          <small>{label}</small>
        </li>
      ))}
    </ol>
  );
}
type AbilityScene = { level: number; title: string; description: string };
const abilityFooterTips = [
  "谦虚的自我评价，也许能为起步带来更多信心哦！",
  "等级本身没有意义，当你为它奋斗时，它便有了意义。",
  "使用一段时间后，可在评测中心再次评估。",
  isGuestPreview() ? "可以在属性库编辑自定义属性。" : "开通会员，可编辑自定义属性。",
];
// Copy approved for this preview lives in 开发设计/Statify-UI说明.md.
const abilityCopy: { meaning: string; scenes: AbilityScene[] }[] = [
  {
    meaning: "身体的力量、耐力，以及完成日常活动与运动的能力。",
    scenes: [
      {
        level: 0,
        title: "果冻都替你担心",
        description:
          "你向一块果冻发起了力量挑战。三秒后，果冻开始担心你的安全。",
      },
      {
        level: 10,
        title: "房间里的远行",
        description:
          "从床边走到门口，你扶住椅背，停下来缓一缓。对你来说，穿过一个房间，也是一段需要攒足力气的路。",
      },
      {
        level: 20,
        title: "街口的距离",
        description:
          "你能自己出门，慢慢走到附近的街口。再往前，就得找个地方坐下，把回家的力气留出来。",
      },
      {
        level: 30,
        title: "楼梯转角",
        description:
          "楼梯还没到头，你先在转角停了下来。等呼吸慢一点，再走完剩下的几层。",
      },
      {
        level: 40,
        title: "顺手的事",
        description:
          "两袋刚买的菜拎回家，你顺手收拾好了厨房。窗外天气正好，还想下楼走走。",
      },
      {
        level: 50,
        title: "再来一场",
        description:
          "傍晚的球场亮起了灯。你擦掉额头的汗，捡起球，招呼朋友再来一场。",
      },
      {
        level: 60,
        title: "跑进晚风里",
        description:
          "河边的路灯一盏盏退到身后，你的呼吸渐渐跟上了步子。跑完这一段，还想去前面的桥上看看。",
      },
      {
        level: 70,
        title: "最后一节",
        description:
          "比赛打到最后一节，你仍能跟上每一次快攻。队友把球传过来，你还有力气往篮下冲。",
      },
      {
        level: 80,
        title: "山顶还有余力",
        description:
          "山路接连翻过几道坡，你仍稳稳走在队伍前面。登顶时，还有余力替大家拍张合照。",
      },
      {
        level: 90,
        title: "上坡还在加速",
        description:
          "比赛进入最后一段陡坡，身边的脚步渐渐慢了。你稳住呼吸，提起速度，在终点前追过一道又一道背影。",
      },
      {
        level: 100,
        title: "神话之躯",
        description:
          "终点线早已在身后，风还没追上你。人类纪录留在上一页，这一页开始写神话。",
      },
    ],
  },
  {
    meaning: "记住信息，并在需要时准确想起的能力。",
    scenes: [
      {
        level: 0,
        title: "刚才说了什么",
        description:
          "你刚说完“我记住了”，就忘了自己记住了什么。下一秒，连这句话也忘了。",
      },
      {
        level: 10,
        title: "话音刚落",
        description:
          "刚听懂的一句简单交代，转眼就想不起内容。哪怕反复说过几遍，也很难在脑海里留下。",
      },
      {
        level: 20,
        title: "约在几点来着",
        description:
          "刚说好的见面时间，过几分钟就记不清了。你还记得要见面，却想不起几点、在哪儿。",
      },
      {
        level: 30,
        title: "还差哪一样",
        description:
          "出门前说好要买三样东西，到了商店，只记得其中两样。剩下那一样明明很熟悉，却怎么也想不起来。",
      },
      {
        level: 40,
        title: "昨天的事还清楚",
        description:
          "朋友问起昨天的安排，你能说清去了哪里、见了谁。几件重要的事，一件也没记混。",
      },
      {
        level: 50,
        title: "接上那个故事",
        description:
          "朋友提起上周的聚会，你很快接上了话。谁带了甜点，谁讲了那个笑话，一段段又浮现在眼前。",
      },
      {
        level: 60,
        title: "合上书以后",
        description:
          "书已经合上几天，聊到其中的内容，你仍能说出几个关键细节。那段读过的故事，又顺着你的话展开了。",
      },
      {
        level: 70,
        title: "细节还在原处",
        description:
          "隔了一周，大家重新讨论那份方案。你还记得当时改过的数字、留下的问题，以及每件事约好的时间。",
      },
      {
        level: 80,
        title: "翻到那一页",
        description:
          "几份厚厚的资料读完数周，关键数字仍能从记忆里找出来。有人问起出处，你把书翻开，指向对应的那一页。",
      },
      {
        level: 90,
        title: "重新铺开的牌",
        description:
          "一副打乱的牌从眼前翻过。你闭上眼，从第一张到最后一张，把顺序重新铺回桌面。",
      },
      {
        level: 100,
        title: "时间的藏书人",
        description:
          "岁月试着从你的记忆里抽走一页，却发现每个瞬间都有自己的位置。对你而言，往事从未远去，只是等着被翻开。",
      },
    ],
  },
  {
    meaning: "积累知识与见识，并通过理解和思考解决问题的能力。",
    scenes: [
      {
        level: 0,
        title: "比白纸还白",
        description: "一张白纸摆在你面前。它知道自己是一张纸，你还在猜。",
      },
      {
        level: 10,
        title: "先认识身边",
        description:
          "你知道杯子用来喝水，钥匙用来开门。再往外看，许多日常常识对你来说还很陌生。",
      },
      {
        level: 20,
        title: "懂得日常的事",
        description:
          "买东西找零、出门认路、使用常见物品，这些日常常识你已经懂得。聊到不熟悉的话题，能说出的东西还不多。",
      },
      {
        level: 30,
        title: "开始问为什么",
        description:
          "朋友聊起历史、地理或生活常识，你已经能接上几句。听到一件新鲜事，也开始试着用知道的东西解释它。",
      },
      {
        level: 40,
        title: "知识连成了线",
        description:
          "一条新闻放在眼前，你知道一些相关背景，也能看懂简单的前因后果。零散的知识，开始在脑中连成一条线。",
      },
      {
        level: 50,
        title: "有自己的判断",
        description:
          "同一件事出现两种说法，你能结合已有的知识，找出哪里对不上。你开始说得清自己的判断，也知道哪些地方还没有答案。",
      },
      {
        level: 60,
        title: "此路不通之后",
        description:
          "原来的计划突然走不通了。你重新看看手里的条件，换个顺序，找到了另一条能到达终点的路。",
      },
      {
        level: 70,
        title: "找到那处卡点",
        description:
          "几次尝试都卡在不同的地方，你把过程并排铺开。看似零散的失败，渐渐指向同一个被忽略的条件。",
      },
      {
        level: 80,
        title: "把知识接起来",
        description:
          "一道陌生的题摆在面前，你认出里面藏着学过的几条原理。换个角度把它们接起来，很快就有了完整的解法。",
      },
      {
        level: 90,
        title: "让答案自己出现",
        description:
          "几条线索指向不同的答案。你把每个解释推到极限，设计一个小实验，让最关键的差别自己显现。",
      },
      {
        level: 100,
        title: "给宇宙写批注",
        description:
          "你翻开宇宙的说明书，发现第三页有个漏洞。合上书时，顺手给物理定律补了两条注释。",
      },
    ],
  },
  {
    meaning: "持续专心做一件事，并在走神或被打断后回到其中的能力。",
    scenes: [
      {
        level: 0,
        title: "已抵达隔壁星系",
        description:
          "你的注意力以光速出发。任务还没收到通知，它已经抵达隔壁星系。",
      },
      {
        level: 10,
        title: "先留在这一刻",
        description:
          "眼前的小事还没做完第一个动作，注意力就已经飘远。哪怕四周安静，你也需要一遍遍提醒自己回到这里。",
      },
      {
        level: 20,
        title: "手指停在这一行",
        description:
          "安静地读上一小段，思绪也常在中途断开。你用手指停在那一行，一次次把自己带回来。",
      },
      {
        level: 30,
        title: "窗外的一声响",
        description:
          "手头的事刚有了起色，窗外一点动静就把注意力带走。回过神来，要重新找一找刚才做到哪里。",
      },
      {
        level: 40,
        title: "先做一小段",
        description:
          "你能专心做上一小会儿，手机一亮，注意力还是容易跟过去。回来后常要重新找状态，一件事就这样分成了好几段。",
      },
      {
        level: 50,
        title: "走神，也能回来",
        description:
          "做事时，你还是会惦记消息，偶尔顺手点开手机。多数时候能发现自己跑远了，回到手头的事，专心和走神仍会交替。",
      },
      {
        level: 60,
        title: "消息可以等一等",
        description:
          "读长文、写报告，你通常能持续投入一小时左右。手机亮起，只是余光里闪了一下，手头的思路还在继续。",
      },
      {
        level: 70,
        title: "守住长任务",
        description:
          "面对需要反复核对的复杂工作，你常能连续投入一两个小时。周围有人走动、聊天，仍能把大部分注意力留在手头的细节上。",
      },
      {
        level: 80,
        title: "干扰中也有主线",
        description:
          "即使时间紧、干扰多，你通常也能盯住当前最重要的一步。临时的事情处理完，很快就能接回原来的工作，继续仔细做下去。",
      },
      {
        level: 90,
        title: "稳定的深度专注",
        description:
          "核对密密麻麻的数据时，即使接连被人打断，你也能迅速接回进度，很少因走神漏掉细节。这样的稳定，通常能贯穿数小时的工作，休息后再回来也依然如此。",
      },
      {
        level: 100,
        title: "时间放轻脚步",
        description:
          "你把注意力落在一点，四周的喧嚣便退成了静止的背景。连时间走过这里，也放轻了脚步。",
      },
    ],
  },
];
export function completeGuestProfile(s: State) {
  if (s.profile.onboarded) return;
  s.profile.onboarded = true;
  if (s.cards.length === 0) {
    const context = ruleContext();
    for (const card of templates(context.now).slice(0, 4))
      saveCard(s, card, context);
  }
}

export function Onboarding({
  s,
  run,
  preview = false,
  close,
}: {
  s: State;
  run: (fn: (s: State) => unknown) => Promise<boolean>;
  preview?: boolean;
  close?: () => void;
}) {
  const attrs = s.attributes
      .filter((a) => a.slot >= 0 && a.slot < 4)
      .sort((a, b) => a.slot - b.slot),
    createdAt = s.createdAt;
  const draftEpoch = useRef(currentDraftEpoch()).current;
  const [d, D] = useState<ProfileDraft>(() => {
    const fallback = {
      step: 0,
      name: s.profile.name === "朋友" ? "" : s.profile.name,
      age: s.profile.age,
      values: attrs.map((a) => a.initial),
      add: true,
    };
    return (!preview && readProfileDraft(createdAt, attrs.length)) || fallback;
  });
  const [busy, B] = useState(false),
    [error, E] = useState("");
  const form = useRef<HTMLFormElement>(null),
    saving = useRef(false);
  const motionAllowed = useMotionAllowed();
  useLayoutEffect(() => {
    const node = form.current,
      scroll = node?.querySelector<HTMLElement>(".dialog-scroll");
    if (scroll) scroll.scrollTop = 0;
    node
      ?.querySelector<HTMLElement>(".dialog-heading h2")
      ?.focus({ preventScroll: true });
  }, [d.step]);
  useEffect(() => {
    const scroll = form.current?.querySelector(".dialog-scroll");
    if (!scroll || !motionAllowed) return;
    const animation = animateSafely(
      scroll,
      [
        { opacity: 0.5, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [d.step, motionAllowed]);
  const [levelHelp, LH] = useState(false),
    levelHelpId = useId(),
    sceneId = useId();
  useEffect(() => {
    LH(false);
  }, [d.step]);
  useEffect(() => {
    if (!preview) writeProfileDraft(createdAt, d, draftEpoch);
  }, [d, createdAt, preview]);
  const last = attrs.length + 2,
    index = d.step - 2,
    attr = attrs[index];
  const ability = abilityCopy[index];
  const value = attr ? d.values[index] : 50;
  const assessment = ability?.scenes[Math.round(value / 10)];
  const title =
    d.step === 0
      ? "您好，玩家："
      : d.step === 1
        ? "认识自己，\n是记录成长的第一步。"
        : d.step === last
          ? "欢迎就位，" + d.name + "。"
          : attr
            ? attr.name + (preview ? " · 预览" : "")
            : "创建角色";
  const footerNote =
    d.step === 0
      ? "请填写资料，建立你的角色档案"
      : d.step === 1
        ? "创建后72小时内，可重新设定一次。"
        : null;
  async function next() {
    if (saving.current) return;
    E("");
    if (d.step === 0 && !d.name.trim()) {
      E("请填写昵称");
      return;
    }
    if (d.step < last) {
      D({ ...d, step: d.step + 1 });
      return;
    }
    if (preview) {
      close?.();
      return;
    }
    saving.current = true;
    B(true);
    try {
      if (
        await run((st) => {
          checkTextLength(
            d.name.trim(),
            textLimits.nickname,
            "昵称",
            st.profile.name,
          );
          st.profile = { name: d.name.trim(), age: d.age, onboarded: true };
          st.firstActionGuide = d.add;
          st.homeTourPending = true;
          attrs.forEach((a, i) => {
            const target = st.attributes.find((x) => x.id === a.id);
            if (target) target.initial = d.values[i];
          });
          if (d.add)
            templates(Date.now())
              .slice(0, 4)
              .forEach((c) => saveCard(st, c, ruleContext(Date.now())));
        })
      ) {
        removeProfileDraft(createdAt, draftEpoch);
      }
    } finally {
      saving.current = false;
      B(false);
    }
  }
  async function enterAsGuest() {
    if (saving.current) return;
    saving.current = true;
    E("");
    B(true);
    try {
      if (await run(completeGuestProfile)) removeProfileDraft(createdAt, draftEpoch);
    } finally {
      saving.current = false;
      B(false);
    }
  }
  return (
    <Dialog
      title={title}
      scrollHeading
      className="onboarding-dialog"
      close={() => close?.()}
      dismissible={preview}
      backRoot={!preview && d.step === 0 && !busy}
      back={() => {
        if (busy) return;
        if (preview) close?.();
        else if (d.step > 0) {
          E("");
          D({ ...d, step: d.step - 1 });
        }
      }}
    >
      <div
        className="creation-progress"
        role="progressbar"
        aria-label="角色创建进度"
        aria-valuemin={1}
        aria-valuemax={last + 1}
        aria-valuenow={d.step + 1}
      >
        {Array.from({ length: last + 1 }, (_, i) => (
          <i key={i} data-active={i <= d.step} />
        ))}
      </div>
      {preview && <span className="creation-preview-note">仅预览</span>}
      <form
        ref={form}
        className="onboarding-form compact-creation"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {d.step === 0 && (
          <div className="creation-fields">
            <p className="creation-welcome">
              欢迎进入 Statify，您的个人数据管理系统。
            </p>
            <Field label="昵称">
              <input
                aria-label="怎么称呼你"
                required
                maxLength={textLimits.nickname}
                value={d.name}
                onChange={(e) => D({ ...d, name: e.target.value })}
                placeholder="输入昵称"
              />
            </Field>
            <Field label="年龄">
              <NumberInput
                showActions={false}
                required
                min="1"
                max="120"
                value={d.age}
                onChange={(e) => D({ ...d, age: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
        {d.step === 1 && (
          <div className="creation-brief">
            <div className="creation-brief-copy">
              <p>
                请认真评估当前能力，
                <br />
                为每项属性选择一个初始等级。
                <button
                  type="button"
                  className="creation-help-toggle"
                  aria-label="初始等级说明"
                  aria-expanded={levelHelp}
                  aria-controls={levelHelpId}
                  onClick={() => LH((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && levelHelp) {
                      e.preventDefault();
                      e.stopPropagation();
                      LH(false);
                    }
                  }}
                >
                  <CircleHelp size={16} aria-hidden="true" />
                </button>
              </p>
              <div
                className="creation-help-note"
                id={levelHelpId}
                role="note"
                hidden={!levelHelp}
              >
                使用一段时间后，可在评测中心进一步评估各项能力，获得更准确的等级。
              </div>
              <p>
                等级越高，升级越难。
                <br />
                请给自己一点时间，谨慎决定。
              </p>
            </div>
          </div>
        )}
        {attr && d.step >= 2 && d.step < last && (
          <div className="creation-level">
            <p className="creation-attribute-meaning">{ability.meaning}</p>
            <div className="creation-level-readout">
              <span>初始等级</span>
              <output
                aria-live="polite"
                aria-label={
                  "当前" + attr.name + "起点为" + d.values[index] + "级"
                }
              >
                {d.values[index]}
                <small> / 100</small>
              </output>
            </div>
            <InitialLevelCurve name={attr.name} value={d.values[index]} />
            <p className="creation-percentile">
              你的水平超过了 <b>{illustrativePercentile(d.values[index])}%</b>{" "}
              的人群（示意）
            </p>
            <Field label={attr.name + "初始等级"}>
              <input
                type="range"
                min="0"
                max={attributeRules.maxLevel}
                step="10"
                aria-describedby={sceneId}
                value={d.values[index]}
                onChange={(e) =>
                  D({
                    ...d,
                    values: d.values.map((v, i) =>
                      i === index ? Number(e.target.value) : v,
                    ),
                  })
                }
              />
            </Field>
            <div className="creation-assessment" id={sceneId}>
              <strong>{assessment.title}</strong>
              <span>{assessment.description}</span>
            </div>
          </div>
        )}
        {d.step === last && (
          <div className="creation-review">
            <div className="creation-review-levels">
              {attrs.map((a, i) => (
                <div key={a.id}>
                  <span>{a.name}</span>
                  <b>{d.values[i]}</b>
                </div>
              ))}
            </div>
            <p className="creation-review-welcome">
              这是你此刻的模样。
              <br />
              未来的变化，我们一起记录。
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <footer className="dialog-actions">
          {d.step === 0 && !preview && isGuestPreview() && (
            <button type="button" disabled={busy} onClick={() => void enterAsGuest()}>
              以访客身份进入
            </button>
          )}
          {d.step > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                E("");
                D({ ...d, step: d.step - 1 });
              }}
            >
              上一步
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "正在创建"
              : d.step === last
                ? preview
                  ? "结束预览"
                  : "进入 Statify"
                : d.step === 1
                  ? "我知道了"
                  : "OK！"}
          </button>
        </footer>
        {d.step !== last && (
          <small className="creation-footer-note">
            {attr && d.step >= 2 && d.step < last
              ? abilityFooterTips[index]
              : footerNote}
          </small>
        )}
      </form>
    </Dialog>
  );
}
