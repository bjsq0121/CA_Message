# Design System — CA_Message

## Product Context
- **What this is:** 회사 전용 실시간 메신저 (Ably Chat 기반)
- **Who it's for:** 청암 ERP 사용자 (사내 직원)
- **Space/industry:** 기업용 메신저 (Slack, 카카오워크, Teams)
- **Project type:** 실시간 채팅 웹앱 + 데스크톱/모바일 앱

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian + Playful touch
- **Decoration level:** minimal
- **Mood:** 업무 도구의 실용성 + 카카오톡의 친근함. 딱딱하지 않으면서 프로페셔널.
- **References:** Slack (사이드바 계층), KakaoTalk (버블/읽음), Teams (Fluent/다크모드)

## Typography
- **Display/Hero:** Plus Jakarta Sans 700
- **Body:** Plus Jakarta Sans 400/500
- **UI/Labels:** Plus Jakarta Sans 500
- **Data/Code:** JetBrains Mono 400
- **Loading:** Google Fonts
- **Scale:** 12px / 13px / 14px / 16px / 20px / 24px / 32px

## Color

### Dark Mode (default)
| Token | Hex | Usage |
|-------|-----|-------|
| --bg-primary | #1a1d21 | 메인 배경 |
| --bg-secondary | #222529 | 사이드바 |
| --bg-surface | #2c2f33 | 카드, 입력, 모달 |
| --bg-hover | #353840 | hover 상태 |
| --bg-active | #3d4148 | active/선택 상태 |
| --text-primary | #e8eaed | 기본 텍스트 |
| --text-secondary | #9aa0a6 | 보조 텍스트 |
| --text-muted | #6b7280 | 비활성 텍스트 |
| --accent | #4A90D9 | 브랜드, 내 메시지 버블 |
| --accent-hover | #5BA0E9 | 버튼 hover |
| --accent-light | rgba(74,144,217,0.15) | 선택 배경 |
| --border | #353840 | 구분선 |
| --msg-mine | #4A90D9 | 내 메시지 버블 |
| --msg-other | #2c2f33 | 상대 메시지 버블 |
| --success | #2ecc71 | 온라인, 성공 |
| --warning | #f39c12 | 경고 |
| --error | #e74c3c | 에러, 안읽음 배지 |

### Light Mode
| Token | Hex | Usage |
|-------|-----|-------|
| --bg-primary | #ffffff | 메인 배경 |
| --bg-secondary | #f5f6f8 | 사이드바 |
| --bg-surface | #ffffff | 카드 |
| --bg-hover | #f0f1f3 | hover |
| --bg-active | #e8eaed | active |
| --text-primary | #1a1d21 | 기본 텍스트 |
| --text-secondary | #6b7280 | 보조 텍스트 |
| --accent | #4A90D9 | 브랜드 |
| --border | #e5e7eb | 구분선 |
| --msg-mine | #4A90D9 | 내 메시지 |
| --msg-other | #f0f1f3 | 상대 메시지 |

## Spacing
- **Base unit:** 4px
- **Density:** comfortable
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(12px) lg(16px) xl(24px) 2xl(32px) 3xl(48px)

## Layout
- **Approach:** hybrid (앱은 2-panel, 모바일은 single)
- **Sidebar:** 320px (데스크톱), 100% (모바일)
- **Max chat width:** 100% (전체 활용)
- **Border radius:** sm(6px) md(8px) lg(12px) xl(18px) full(9999px)
- **Message bubble radius:** 18px (카카오톡 스타일)

## Motion
- **Approach:** minimal-functional
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50ms) short(150ms) medium(250ms)
- **Message appear:** slide-up 4px + fade-in 150ms

## Components
- **Avatar:** 40px circle, 첫 글자 이니셜, accent 배경
- **Message bubble:** 18px radius, max-width 70%, 내 메시지 우측 파란, 상대 좌측 그레이
- **Unread badge:** 빨간 원형, 흰 텍스트, min-width 20px
- **Online dot:** 10px 초록 원, avatar 우하단
- **Input:** 둥근 모서리(full), 배경 surface, focus시 accent border
- **Button primary:** accent 배경, 흰 텍스트, 8px radius
- **Modal:** surface 배경, 12px radius, 반투명 오버레이

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-14 | 다크 모드 기본값 | 개발팀 중심 사용자, 장시간 사용 시 눈 피로 감소 |
| 2026-04-14 | Plus Jakarta Sans | 한글 가독성 + 모던 산세리프, Inter/Roboto 대비 차별화 |
| 2026-04-14 | 카카오톡 스타일 버블 | 한국 사용자에게 가장 익숙한 메시지 UI |
| 2026-04-14 | Slack 스타일 사이드바 | 채팅방 목록 + 대화의 명확한 분리 |
