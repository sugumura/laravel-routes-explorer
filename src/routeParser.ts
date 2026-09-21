/** route:list --json の 1 要素を正規化したもの */
export interface LaravelRoute {
  domain: string | null;
  /** 表示用に正規化した HTTP メソッド。GET があれば HEAD は除き、全メソッドなら ["ANY"] */
  methods: string[];
  /** 先頭に "/" を付けた URI */
  uri: string;
  name: string | null;
  /** "App\Http\Controllers\UserController@index" または "Closure" など */
  action: string;
  /** 解決済みミドルウェアのクラス名の配列 */
  middleware: string[];
}

interface RawRoute {
  domain?: string | null;
  method?: string;
  uri?: string;
  name?: string | null;
  action?: string;
  middleware?: string[] | string;
}

const ALL_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/**
 * `php artisan route:list --json` の標準出力を解析する。
 * 前後に警告文などが混ざることがあるので、最初の "[" から最後の "]" までを JSON として読む。
 */
export function parseRouteList(stdout: string): LaravelRoute[] {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    if (/doesn't have any routes/i.test(stdout)) {
      return [];
    }
    throw new Error(`route:list の出力に JSON が見つかりません:\n${stdout.trim() || '(空の出力)'}`);
  }

  const json = stdout.slice(start, end + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`route:list の JSON を解析できません: ${(e as Error).message}`);
  }

  if (!Array.isArray(raw)) {
    throw new Error('route:list の出力が配列ではありません');
  }

  return (raw as RawRoute[]).map(normalize);
}

function normalize(raw: RawRoute): LaravelRoute {
  const rawUri = raw.uri ?? '';
  const middleware = Array.isArray(raw.middleware)
    ? raw.middleware
    : typeof raw.middleware === 'string' && raw.middleware !== ''
      ? raw.middleware.split('\n')
      : [];

  return {
    domain: raw.domain ?? null,
    methods: normalizeMethods(raw.method ?? ''),
    uri: rawUri.startsWith('/') ? rawUri : `/${rawUri}`,
    name: raw.name ?? null,
    action: raw.action ?? '',
    middleware,
  };
}

export function normalizeMethods(method: string): string[] {
  const methods = method
    .split('|')
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m !== '');

  if (methods.length === 0) {
    return ['?'];
  }
  if (ALL_METHODS.every((m) => methods.includes(m))) {
    return ['ANY'];
  }
  if (methods.includes('GET') && methods.includes('HEAD')) {
    return methods.filter((m) => m !== 'HEAD');
  }
  return methods;
}
