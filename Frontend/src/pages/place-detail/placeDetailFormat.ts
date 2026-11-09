import type {
  PlaceBlogSearchResult,
  PlaceDayOfWeek,
  PlaceMenu,
  PlaceOpeningDay,
} from '../../entities/info/types';
import type { PlaceBlogListItem } from './components/PlaceBlogList';
import type {
  PlaceMenuItem,
  PlaceWeeklyHours,
} from './components/PlaceInformation';

const WEEK_DAYS: { code: PlaceDayOfWeek; label: string }[] = [
  { code: 'MONDAY', label: '월' },
  { code: 'TUESDAY', label: '화' },
  { code: 'WEDNESDAY', label: '수' },
  { code: 'THURSDAY', label: '목' },
  { code: 'FRIDAY', label: '금' },
  { code: 'SATURDAY', label: '토' },
  { code: 'SUNDAY', label: '일' },
];

// Date.getDay()의 순서입니다.
const DAY_CODES_FROM_SUNDAY: PlaceDayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const BLOG_SOURCE_LABELS: Record<string, string> = {
  NAVER: '네이버',
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function toWeeklyHours(
  openingHours: PlaceOpeningDay[] | null,
  now = new Date(),
): PlaceWeeklyHours[] {
  if (!openingHours || openingHours.length === 0) {
    return [];
  }

  const todayCode = DAY_CODES_FROM_SUNDAY[now.getDay()];

  return WEEK_DAYS.map(({ code, label }) => {
    const openingDay = openingHours.find(item => item.dayOfWeek === code);
    const isToday = code === todayCode;

    if (!openingDay) {
      return { day: label, hours: '정보 없음', isToday };
    }

    if (openingDay.periods.length === 0) {
      return { day: label, hours: '휴무', isToday, isClosed: true };
    }

    return {
      day: label,
      hours: openingDay.periods
        .map(period => `${period.opensAt} – ${period.closesAt}`)
        .join('\n'),
      isToday,
    };
  });
}

function formatPrice(price: number) {
  return `${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

export function toMenuItems(menus: PlaceMenu[]): PlaceMenuItem[] {
  return menus.map(menu => ({
    name: menu.name,
    price: menu.price === null ? '가격 정보 없음' : formatPrice(menu.price),
  }));
}

export function toMenuPriceRange(menus: PlaceMenu[]): string | undefined {
  const prices = menus.flatMap(menu => (menu.price === null ? [] : [menu.price]));
  if (prices.length === 0) {
    return undefined;
  }

  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  return lowest === highest
    ? undefined
    : `${formatPrice(lowest)} ~ ${formatPrice(highest)}`;
}

function toRelativeDate(postDate: string, now: Date) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(postDate);
  if (!matched) {
    return postDate;
  }

  const posted = new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round(
    (today.getTime() - posted.getTime()) / MILLISECONDS_PER_DAY,
  );

  if (days < 0) return postDate;
  if (days === 0) return '오늘';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function toBlogListItems(
  result: PlaceBlogSearchResult | null,
  now = new Date(),
): PlaceBlogListItem[] {
  if (!result) {
    return [];
  }

  const sourceLabel = BLOG_SOURCE_LABELS[result.source] ?? result.source;

  return result.posts.map(post => ({
    id: post.link,
    title: post.title,
    link: post.link,
    isNaver: result.source === 'NAVER',
    meta: [
      sourceLabel,
      post.bloggerName,
      post.postDate ? toRelativeDate(post.postDate, now) : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}
