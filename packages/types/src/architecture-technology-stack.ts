export type ArchitectureTechnologyStackCategory =
  | "frontend_static"
  | "frontend_spa"
  | "frontend_ssr"
  | "frontend_mobile"
  | "backend_simple_api"
  | "backend_complex"
  | "backend_microservices";

type TechnologyStackRule = {
  readonly category: ArchitectureTechnologyStackCategory;
  readonly pattern: RegExp;
};

const FRONTEND_STACK_RULES: readonly TechnologyStackRule[] = [
  {
    category: "frontend_mobile",
    pattern: /(?:react[\s.-]*native|리액트\s*네이티브|flutter|플러터|swiftui|\bswift\b|\bkotlin\b|\bandroid\b|\bios\b|expo(?:\s+go)?|ionic|capacitor|nativescript|xamarin|\.net\s*maui)/iu
  },
  {
    category: "frontend_ssr",
    pattern: /(?:next\.?\s*js|\bnextjs\b|넥스트(?:\.?\s*js)?|nuxt\.?\s*js|\bnuxtjs\b|넉스트|\bremix\b|svelte[\s.-]*kit|스벨트\s*키트|solid[\s.-]*start)/iu
  },
  {
    category: "frontend_spa",
    pattern: /(?:\breact\b|리액트|\bvue(?:\.?\s*js)?\b|\bangular\b|앵귤러|\bsvelte\b|스벨트|solid\.?\s*js|\bpreact\b|\bember\b|\bvite\b)/iu
  },
  {
    category: "frontend_static",
    pattern: /(?:html\s*\/?\s*css\s*\/?\s*(?:java\s*script|javascript|js)|vanilla\s*(?:java\s*script|javascript|js)|바닐라\s*(?:자바스크립트|js)|순수\s*(?:웹|자바스크립트)|\bjquery\b|static\s+(?:site|web)|정적\s*(?:사이트|웹))/iu
  }
];

const BACKEND_STACK_RULES: readonly TechnologyStackRule[] = [
  {
    category: "backend_microservices",
    pattern: /(?:micro[\s-]*services?|마이크로\s*서비스|spring\s*cloud|스프링\s*클라우드|\bkubernetes\b|\bk8s\b|service\s*mesh|\bistio\b)/iu
  },
  {
    category: "backend_complex",
    pattern: /(?:spring[\s.-]*(?:boot|framework)|스프링\s*(?:부트|프레임워크)|\bdjango\b|장고|ruby\s+on\s+rails|\brails\b|레일즈|\blaravel\b|라라벨|asp\s*\.?\s*net(?:\s*core)?|\.net\s*(?:core|backend|백엔드)|\bnest\.?\s*js\b|네스트\s*(?:js|제이에스)|\bquarkus\b|\bmicronaut\b|\bgrails\b|\bphoenix\b|\bplay\s+framework\b)/iu
  },
  {
    category: "backend_simple_api",
    pattern: /(?:node\.?\s*js|노드\.?\s*js|\bexpress(?:\.?\s*js)?\b|익스프레스|\bfastify\b|\bkoa\b|\bhono\b|python\s*flask|\bflask\b|\bfastapi\b|패스트\s*api|\bbottle\b|\bsinatra\b|\bgin\b|\bfiber\b|\bactix\b|\baxum\b|\brocket\b|aws\s*lambda|람다)/iu
  }
];

export function resolveArchitectureTechnologyStackCategory(
  questionId: string,
  answer: string
): ArchitectureTechnologyStackCategory | null {
  const normalizedAnswer = answer.normalize("NFKC").trim().toLowerCase();
  const rules = questionId === "frontend"
    ? FRONTEND_STACK_RULES
    : questionId === "backend"
      ? BACKEND_STACK_RULES
      : [];

  return rules.find(({ pattern }) => pattern.test(normalizedAnswer))?.category ?? null;
}