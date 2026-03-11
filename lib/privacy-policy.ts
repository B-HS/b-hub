export const PRIVACY_POLICY = {
  title: '개인정보처리방침',
  lastUpdated: '2026-03-10',
  sections: [
    {
      heading: '1. 개인정보의 수집 및 이용 목적',
      content:
        '본 서비스는 다음의 목적을 위해 개인정보를 수집 및 이용합니다.\n' +
        '- 서비스 제공 및 운영\n' +
        '- Google OAuth를 통한 사용자 인증\n' +
        '- 서비스 개선 및 맞춤형 기능 제공',
    },
    {
      heading: '2. 수집하는 개인정보 항목',
      content:
        'Google OAuth를 통해 다음 정보를 수집합니다.\n' +
        '- 이메일 주소\n' +
        '- 프로필 이름\n' +
        '- 프로필 이미지 URL',
    },
    {
      heading: '3. 개인정보의 보유 및 이용 기간',
      content:
        '수집된 개인정보는 서비스 이용 기간 동안 보유하며, 회원 탈퇴 시 즉시 파기합니다.',
    },
    {
      heading: '4. 개인정보의 제3자 제공',
      content:
        '본 서비스는 사용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.',
    },
    {
      heading: '5. 개인정보의 파기',
      content:
        '개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.',
    },
    {
      heading: '6. 이용자의 권리',
      content:
        '이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제를 요청할 수 있습니다.',
    },
    {
      heading: '7. 문의처',
      content: '개인정보 관련 문의: hs@gumyo.net',
    },
  ],
} as const
