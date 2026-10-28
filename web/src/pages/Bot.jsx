// 카톡 봇(/bot): 단톡방에 봇을 넣는 방법과 명령어. 봇 명령은 iris 봇(ipy2/irispy.py)과 같다.
import "../styles/bot.css";
import { Icon } from "../components/Icon.jsx";
import { Reveal } from "../components/Motion.jsx";

const OPEN_CHAT_URL = "https://open.kakao.com/o/sQP47JFi";

/** 명령어 묶음(봇 도움말과 같은 순서). 모두 ".명령 월드 닉네임". */
const COMMANDS = [
  {
    title: "정보",
    items: [
      [".정보", "레벨·경험치·길드·전투력·잠재합·에디합·헥사"],
      [".전체정보", "정보를 한 번에 길게"],
      [".경험치", "최근 7일 경험치"],
      [".스탯", "보스 세팅 주요 스탯"],
      [".현재스탯", "지금 낀 장비 기준 스탯"]
    ]
  },
  {
    title: "장비",
    items: [
      [".장비", "부위별 장비와 스타포스"],
      [".세트효과", "적용 중인 세트 효과"],
      [".안드로이드", "안드로이드·하트"],
      [".펫", "펫과 펫 장비"],
      [".코디", "캐시 장비"]
    ]
  },
  {
    title: "성장",
    items: [
      [".헥사", "HEXA 스킬·스탯"],
      [".V매트릭스", "V 코어"],
      [".심볼", "아케인·어센틱 심볼"],
      [".하이퍼스탯", "하이퍼 스탯"]
    ]
  },
  {
    title: "기타",
    items: [
      [".유니온", "유니온 등급·공격대"],
      [".길드", "길드 정보"],
      [".스킬", "장착 스킬"],
      [".링크스킬", "링크 스킬"],
      [".쥬얼", "쥬얼"]
    ]
  },
  {
    title: "비교·도움말",
    items: [
      [".경험치비교 월드 닉1 닉2 7일", "두 캐릭터 경험치 비교"],
      [".도움말", "명령어 목록"]
    ]
  }
];

/** 미리보기 말풍선(실제 캐릭터가 아닌 예시 형식). */
const SAMPLE_REPLY = ["🍁 [스카니아] 닉네임", "Lv.285 직업", "경험치 · 길드 · 최근 로그인", "", "- 전투력", "- 잠재합 / 에디합", "- 헥사 스킬 · 헥사 스탯"];

export function Bot() {
  return (
    <div class="bot">
      <header class="bot-hero">
        <div class="bot-hero__copy">
          <p class="bot-hero__over">메이플M 플러스</p>
          <h1 class="bot-hero__title display">
            카카오톡 봇
            <span class="bot-free">무료</span>
          </h1>
          <ul class="bot-hero__points">
            <li>캐릭터 정보 · 스탯 · 장비 · 경험치 · HEXA</li>
            <li>명령어 하나로 단톡방에서 바로</li>
          </ul>
          <a class="bot-kakao" href={OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" size={18} />
            오픈채팅으로 신청하기
          </a>
        </div>
        <div class="bot-phone" aria-hidden="true">
          <div class="bot-phone__room">
            <p class="bot-bubble bot-bubble--me">.정보 스카니아 닉네임</p>
            <div class="bot-bubble bot-bubble--bot">
              {SAMPLE_REPLY.map((line, index) => (
                <span key={index} class="bot-bubble__line">
                  {line || " "}
                </span>
              ))}
            </div>
            <p class="bot-bubble bot-bubble--me">.스탯 스카니아 닉네임</p>
          </div>
        </div>
      </header>

      <Reveal class="card bot-steps">
        <h2 class="bot-section__title">신청 방법</h2>
        <ol class="bot-steps__list">
          <li>
            <span class="bot-steps__no num">1</span>
            <span>
              <a href={OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer">
                오픈채팅방
              </a>
              에 들어와 주세요.
            </span>
          </li>
          <li>
            <span class="bot-steps__no num">2</span>
            <span>
              봇을 넣을 <strong>단톡방 링크</strong>와 <strong>단톡방 비밀번호</strong>를 적어 주세요.
            </span>
          </li>
          <li>
            <span class="bot-steps__no num">3</span>
            <span>주인장이 확인할 때마다 봇을 입장시켜 드려요.</span>
          </li>
        </ol>
        <ul class="bot-notes">
          <li>
            <Icon name="heart" size={16} />
            비용은 받지 않아요.
          </li>
          <li>
            <Icon name="info" size={16} />
            주인장은 단톡방 대화를 절대 보지 않아요.
          </li>
          <li>
            <Icon name="clock" size={16} />
            활동이 거의 없는 단톡방은 정기적으로 정리해요(봇이 나가요).
          </li>
        </ul>
      </Reveal>

      <Reveal class="card bot-commands">
        <h2 class="bot-section__title">
          명령어 <code class="bot-commands__form">.명령 월드 닉네임</code>
        </h2>
        <div class="bot-groups">
          {COMMANDS.map((group) => (
            <section key={group.title} class="bot-group">
              <h3 class="bot-group__title">{group.title}</h3>
              <ul class="bot-group__list">
                {group.items.map(([command, text]) => (
                  <li key={command}>
                    <code>{command}</code>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
