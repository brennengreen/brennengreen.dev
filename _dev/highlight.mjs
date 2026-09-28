// Syntax highlighter shared by the dev server (bakes code blocks into post HTML) and the editor (live preview).
// Output is one <span class="line"> per source line so CSS can number them; tokens are <span class="tok-*">.

export const LANGUAGES = {
  plaintext: 'text',
  c: 'c',
  cpp: 'c++',
  csharp: 'c#',
  glsl: 'glsl',
  hlsl: 'hlsl',
  metal: 'metal',
  swift: 'swift',
  rust: 'rust',
  javascript: 'js',
  typescript: 'ts',
  python: 'python',
  bash: 'shell',
  json: 'json',
  html: 'html',
  css: 'css',
};

const ALIASES = {
  '': 'plaintext', text: 'plaintext', txt: 'plaintext', plain: 'plaintext',
  clike: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'c',
  cs: 'csharp', 'c#': 'csharp',
  vert: 'glsl', frag: 'glsl', comp: 'glsl',
  msl: 'metal', rs: 'rust',
  js: 'javascript', mjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  xml: 'html', svg: 'html',
};

export function resolveLanguage(lang) {
  const id = String(lang || '').trim().toLowerCase().replace(/^language-/, '');
  if (LANGUAGES[id]) return id;
  if (ALIASES[id]) return ALIASES[id];
  return /^[a-z][\w+#-]*$/.test(id) ? id : 'plaintext';
}

export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
const vectors = (bases, matrices = true) =>
  bases.flatMap((b) => [2, 3, 4].flatMap((n) => [`${b}${n}`, ...(matrices ? [2, 3, 4].map((m) => `${b}${n}x${m}`) : [])])).join(' ');

function atLineStart(code, i) {
  for (let k = i - 1; k >= 0; k--) {
    if (code[k] === '\n') return true;
    if (code[k] !== ' ' && code[k] !== '\t') return false;
  }
  return true;
}

// Runs sticky-regex rules left to right; a rule's type may be a function of (match, state) or a token list.
function run(code, rules) {
  const tokens = [];
  const state = { code, i: 0, end: 0, prev: '' };
  const push = (type, text) => {
    const last = tokens[tokens.length - 1];
    if (last && last[0] === type) last[1] += text;
    else tokens.push([type, text]);
    if (text.trim()) state.prev = text.trim();
  };
  outer: while (state.i < code.length) {
    for (const [re, type] of rules) {
      re.lastIndex = state.i;
      const m = re.exec(code);
      if (!m || !m[0]) continue;
      state.end = state.i + m[0].length;
      const t = typeof type === 'function' ? type(m, state) : type;
      if (Array.isArray(t)) for (const [tt, text] of t) push(tt, text);
      else push(t, m[0]);
      state.i = state.end;
      continue outer;
    }
    push(null, code[state.i]);
    state.i += 1;
  }
  return tokens;
}

const NUMBER = /(?:0[xX][\da-fA-F_']+|0[bB][01_']+|0[oO][0-7_]+|(?:\d[\d_']*(?:\.[\d_']*)?|\.\d[\d_']*)(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
const DQ = /"(?:\\[\s\S]|[^"\\\n])*"?/y;
const SQ = /'(?:\\[\s\S]|[^'\\\n])*'?/y;
const BACKTICK = /`(?:\\[\s\S]|[^`\\])*`?/y;
const OPERATOR = /[+\-*/%=&|^!<>?:~]+/y;
const PUNCT = /[{}()[\];,.@#\\]/y;
const SPACE = /\s+/y;
const CALL = /^\s*\(/;
const DEFINES_FUNCTION = new Set(['fn', 'func', 'def', 'function']);
const DEFINES_TYPE = new Set(['class', 'struct', 'enum', 'interface', 'trait', 'impl', 'protocol', 'extension', 'union', 'type', 'typealias', 'record', 'namespace']);

function cFamily(cfg) {
  const kw = words(cfg.keywords);
  const types = words(cfg.types || '');
  const builtins = words(cfg.builtins || '');
  const constants = words(cfg.constants || '');
  const classify = (m, s) => {
    const w = m[0];
    const after = s.code.slice(s.end, s.end + 40);
    if (kw.has(w)) return 'keyword';
    if (constants.has(w)) return 'constant';
    if (types.has(w)) return 'type';
    if (cfg.builtinPattern?.test(w)) return 'builtin';
    if (cfg.constantPattern?.test(w)) return 'constant';
    if (DEFINES_TYPE.has(s.prev)) return 'type';
    if (DEFINES_FUNCTION.has(s.prev)) return 'function';
    if (builtins.has(w)) return 'builtin';
    if (cfg.macros && after.startsWith('!')) return 'builtin';
    if (CALL.test(after)) return 'function';
    if (w.length > 1 && /^[A-Z][A-Z0-9_]*$/.test(w)) return 'constant';
    if (cfg.pascalTypes && /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(w)) return 'type';
    return null;
  };
  const rules = [
    [/\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
    [/\/\/[^\n]*/y, 'comment'],
  ];
  if (cfg.preprocessor) {
    rules.push([/(?<=#[ \t]*(?:include|import)[ \t]*)<[^>\n]*>/y, 'string']);
    rules.push([/#[ \t]*[A-Za-z_]\w*/y, (m, s) => (atLineStart(s.code, s.i) ? 'directive' : 'operator')]);
  }
  rules.push(...(cfg.rules || []));
  rules.push([DQ, 'string']);
  if (cfg.backticks) rules.push([BACKTICK, 'string']);
  if (!cfg.noCharLiterals) rules.push([SQ, 'string']);
  rules.push([NUMBER, 'number']);
  rules.push([/[A-Za-z_$][\w$]*/y, classify]);
  rules.push([OPERATOR, 'operator'], [PUNCT, 'punct'], [SPACE, null]);
  return (code) => run(code, rules);
}

const C_KEYWORDS = 'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while _Alignas _Alignof _Atomic _Bool _Generic _Noreturn _Static_assert _Thread_local';
const C_TYPES = 'void bool char short int long float double signed unsigned size_t ssize_t ptrdiff_t intptr_t uintptr_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE';
const CPP_KEYWORDS = `${C_KEYWORDS} alignas alignof asm catch class concept consteval constexpr constinit const_cast co_await co_return co_yield decltype delete dynamic_cast explicit export final friend mutable namespace new noexcept operator override private protected public reinterpret_cast requires static_assert static_cast template this thread_local throw try typeid typename using virtual`;
const CPP_TYPES = `${C_TYPES} wchar_t char8_t char16_t char32_t std string string_view vector array map unordered_map set unordered_set unique_ptr shared_ptr weak_ptr optional variant span pair tuple function`;
const GL_TYPES = /^GL(?:enum|boolean|bitfield|byte|short|int|sizei|ubyte|ushort|uint|float|clampf|double|clampd|char|intptr|sizeiptr|int64|uint64|sync|void)$/;

const LANGS = {
  c: cFamily({ preprocessor: true, keywords: C_KEYWORDS, types: C_TYPES, constants: 'true false NULL', builtinPattern: GL_TYPES }),
  cpp: cFamily({ preprocessor: true, pascalTypes: true, keywords: CPP_KEYWORDS, types: CPP_TYPES, constants: 'true false NULL nullptr', builtinPattern: GL_TYPES }),
  csharp: cFamily({
    pascalTypes: true,
    keywords: 'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while async await var get set init record yield when where with nameof partial global value',
    types: 'bool byte sbyte char decimal double float int uint long ulong short ushort object string void dynamic nint nuint',
    constants: 'true false null',
    rules: [[/@"(?:""|[^"])*"?|\$"(?:\\[\s\S]|[^"\\\n])*"?/y, 'string']],
  }),
  glsl: cFamily({
    preprocessor: true,
    keywords: 'attribute const uniform varying buffer shared coherent volatile restrict readonly writeonly layout centroid flat smooth noperspective patch sample break continue do for while switch case default if else subroutine in out inout invariant precise discard return struct precision highp mediump lowp',
    types: `void bool int uint float double ${vectors(['vec', 'dvec', 'bvec', 'ivec', 'uvec'], false)} ${vectors(['mat', 'dmat'])} sampler1D sampler2D sampler3D samplerCube sampler2DShadow samplerCubeShadow sampler1DArray sampler2DArray sampler2DArrayShadow samplerBuffer sampler2DMS isampler2D isampler3D usampler2D usampler3D image1D image2D image3D imageCube iimage2D uimage2D atomic_uint`,
    builtins: 'radians degrees sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf floatBitsToInt intBitsToFloat fma length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not texture textureSize textureLod textureOffset texelFetch textureGrad textureProj texture2D texture3D textureCube imageLoad imageStore dFdx dFdy fwidth barrier memoryBarrier EmitVertex EndPrimitive',
    constants: 'true false',
    builtinPattern: /^gl_\w+$/,
  }),
  hlsl: cFamily({
    preprocessor: true,
    keywords: 'break case cbuffer tbuffer const continue default discard do else extern for groupshared if in inline inout out nointerpolation noperspective precise register return row_major column_major shared static struct switch typedef uniform volatile while packoffset linear centroid sample triangle point line lineadj triangleadj namespace class interface',
    types: `void bool int uint dword half float double min16float min10float min16int min12int min16uint vector matrix ${vectors(['bool', 'int', 'uint', 'half', 'float', 'double', 'min16float'])} Texture1D Texture2D Texture3D TextureCube Texture2DArray TextureCubeArray Texture2DMS RWTexture1D RWTexture2D RWTexture3D Buffer RWBuffer StructuredBuffer RWStructuredBuffer ByteAddressBuffer RWByteAddressBuffer AppendStructuredBuffer ConsumeStructuredBuffer SamplerState SamplerComparisonState ConstantBuffer RaytracingAccelerationStructure`,
    builtins: 'abs acos all any asfloat asin asint asuint atan atan2 ceil clamp clip cos cosh cross ddx ddy degrees determinant distance dot exp exp2 faceforward floor fmod frac frexp fwidth isfinite isinf isnan ldexp length lerp log log10 log2 max min modf mul normalize pow radians rcp reflect refract round rsqrt saturate sign sin sincos sinh smoothstep sqrt step tan tanh transpose trunc Sample SampleLevel SampleGrad SampleCmp Load Store GetDimensions InterlockedAdd GroupMemoryBarrierWithGroupSync WaveActiveSum',
    constants: 'true false',
    constantPattern: /^SV_\w+$/,
  }),
  metal: cFamily({
    preprocessor: true,
    pascalTypes: true,
    keywords: `${CPP_KEYWORDS} kernel vertex fragment device constant thread threadgroup threadgroup_imageblock ray_data object_data visible stage_in`,
    types: `${CPP_TYPES} half uchar ushort uint ulong ${vectors(['bool', 'char', 'uchar', 'short', 'ushort', 'int', 'uint', 'long', 'ulong', 'half', 'float'])} texture1d texture2d texture3d texturecube texture2d_array depth2d sampler access packed_float2 packed_float3 packed_float4 simdgroup_matrix`,
    builtins: 'abs clamp mix saturate step smoothstep min max fract floor ceil round trunc sqrt rsqrt pow exp exp2 log log2 sin cos tan dot cross length normalize distance reflect refract select fma sample read write get_width get_height simd_sum threadgroup_barrier',
    constants: 'true false nullptr',
    rules: [[/\[\[[^\]\n]*\]\]/y, 'directive']],
  }),
  swift: cFamily({
    pascalTypes: true,
    noCharLiterals: true,
    keywords: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private precedencegroup protocol public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in repeat return throw switch where while as any await is some super throws try async actor final lazy mutating nonmutating optional override required unowned weak convenience dynamic indirect',
    types: 'Int Int8 Int16 Int32 Int64 UInt UInt8 UInt16 UInt32 UInt64 Float Double Bool String Character Void Array Dictionary Set Optional Any AnyObject Self',
    constants: 'true false nil self',
    rules: [[/"""[\s\S]*?(?:"""|$)/y, 'string'], [/@[A-Za-z_]\w*/y, 'directive'], [/#[A-Za-z_]\w*/y, 'directive']],
  }),
  rust: cFamily({
    pascalTypes: true,
    macros: true,
    noCharLiterals: true,
    keywords: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while yield',
    types: 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc Self HashMap HashSet',
    constants: 'true false None Some Ok Err self',
    rules: [
      [/#!?\[[^\]\n]*\]/y, 'directive'],
      [/r#*"[\s\S]*?"#*/y, 'string'],
      [/'(?:\\.|[^'\\\n])'/y, 'string'],
      [/'[A-Za-z_]\w*/y, 'type'],
    ],
  }),
  javascript: cFamily({
    pascalTypes: true,
    backticks: true,
    keywords: 'async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield',
    constants: 'true false null undefined NaN Infinity',
    builtins: 'console window document globalThis Math JSON Object Array String Number Boolean BigInt Promise Map Set WeakMap WeakSet Symbol Date RegExp Error TypeError fetch require module exports process setTimeout clearTimeout setInterval clearInterval requestAnimationFrame',
  }),
  typescript: cFamily({
    pascalTypes: true,
    backticks: true,
    keywords: 'async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield abstract as asserts declare enum implements infer interface is keyof namespace override private protected public readonly satisfies type unique',
    types: 'string number boolean bigint symbol object any unknown never void',
    constants: 'true false null undefined NaN Infinity',
    builtins: 'console window document globalThis Math JSON Object Array String Number Boolean BigInt Promise Map Set WeakMap WeakSet Symbol Date RegExp Error TypeError Record Partial Readonly Pick Omit fetch require module exports process setTimeout clearTimeout setInterval clearInterval requestAnimationFrame',
  }),
  generic: cFamily({
    pascalTypes: true,
    backticks: true,
    keywords: 'if else elif for foreach while do loop return break continue switch case default match when function func fn def fun class struct enum interface trait impl import export from package module use require let var val const static public private protected internal new delete try catch except finally throw throws raise in of is as and or not then end begin local async await yield',
    constants: 'true false null nil none None True False self this',
    rules: [[/#[^\n]*/y, (m, s) => (s.i === 0 || /\s/.test(s.code[s.i - 1]) ? 'comment' : 'operator')]],
  }),
  python: python(),
  bash: bash(),
  json: json(),
  html: html(),
  css: css(),
};

function python() {
  const kw = words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case');
  const constants = words('True False None NotImplemented Ellipsis');
  const builtins = words('abs all any bin bool bytes bytearray callable chr classmethod compile complex dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip self cls __name__ __init__ __main__ __file__');
  const classify = (m, s) => {
    const w = m[0];
    if (kw.has(w)) return 'keyword';
    if (constants.has(w)) return 'constant';
    if (s.prev === 'def') return 'function';
    if (s.prev === 'class') return 'type';
    if (builtins.has(w)) return 'builtin';
    if (CALL.test(s.code.slice(s.end, s.end + 40))) return 'function';
    if (w.length > 1 && /^[A-Z][A-Z0-9_]*$/.test(w)) return 'constant';
    if (/^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(w)) return 'type';
    return null;
  };
  return (code) =>
    run(code, [
      [/#[^\n]*/y, 'comment'],
      [/(?:[rRbBuUfF]{1,2}(?=["']))?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?)/y, 'string'],
      [/@[A-Za-z_][\w.]*/y, 'directive'],
      [/(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[jJlL]?/y, 'number'],
      [/[A-Za-z_]\w*/y, classify],
      [OPERATOR, 'operator'],
      [PUNCT, 'punct'],
      [SPACE, null],
    ]);
}

function bash() {
  const kw = words('if then else elif fi for while until do done case esac function in select return export local readonly declare unset shift source alias exit break continue time');
  const commandNext = words('then do else elif if while until time sudo exec xargs env nohup command');
  return (code) => {
    let command = true;
    const word = (m) => {
      const w = m[0];
      let type = null;
      if (kw.has(w)) type = 'keyword';
      else if (command) type = 'function';
      command = commandNext.has(w);
      return type;
    };
    return run(code, [
      [/#[^\n]*/y, (m, s) => (s.i === 0 || /[\s;|&(]/.test(s.code[s.i - 1]) ? 'comment' : null)],
      [/\n/y, () => ((command = true), null)],
      [/"(?:\\[\s\S]|[^"\\])*"?|'[^']*'?/y, () => ((command = false), 'string')],
      [/\$(?:\{[^}\n]*\}|\(\(?|[A-Za-z_]\w*|[0-9@#?$!*-])/y, (m) => ((command = m[0].startsWith('$(')), 'builtin')],
      [/(?<=^|\s)--?[A-Za-z][\w-]*=?/y, () => ((command = false), 'constant')],
      [/(?<![\w.-])\d+(?![\w.-])/y, () => ((command = false), 'number')],
      [/[A-Za-z_./~][\w./~:+@%-]*/y, word],
      [/&&|\|\||[|;&(]/y, () => ((command = true), 'operator')],
      [/[<>]+|[=!]/y, 'operator'],
      [/[)\]{}[]/y, 'punct'],
      [/[ \t]+/y, null],
    ]);
  };
}

function json() {
  return (code) =>
    run(code, [
      [/"(?:\\[\s\S]|[^"\\\n])*"?(?=\s*:)/y, 'property'],
      [/"(?:\\[\s\S]|[^"\\\n])*"?/y, 'string'],
      [/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y, 'number'],
      [/\b(?:true|false|null)\b/y, 'constant'],
      [/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
      [/[{}[\]:,]/y, 'punct'],
      [SPACE, null],
    ]);
}

function html() {
  const tagRules = [
    [/<\/?|\/?>/y, 'punct'],
    [/(?<=<\/?)[A-Za-z][\w:-]*/y, 'keyword'],
    [/(?<==\s*)[^\s"'=<>`]+/y, 'string'],
    [/[^\s"'=<>/]+/y, 'property'],
    [/=/y, 'operator'],
    [/"[^"]*"?|'[^']*'?/y, 'string'],
    [SPACE, null],
  ];
  return (code) =>
    run(code, [
      [/<!--[\s\S]*?(?:-->|$)/y, 'comment'],
      [/<![^>]*>?/y, 'directive'],
      [/<\/?[A-Za-z][^<>]*>?/y, (m) => run(m[0], tagRules)],
      [/&(?:#\d+|#x[\da-fA-F]+|\w+);/y, 'constant'],
      [/[^<&]+/y, null],
    ]);
}

function css() {
  // A run of text followed by `{` before any `;` or `}` is a selector; anything else is a declaration.
  const inSelector = (s) => /^[^;{}]*\{/.test(s.code.slice(s.end, s.end + 240));
  return (code) =>
    run(code, [
      [/\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
      [/@[\w-]+/y, 'directive'],
      [/"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?/y, 'string'],
      [/--[\w-]+(?=\s*:[^;{}]*(?:;|\}|$))/y, 'property'],
      [/-?[A-Za-z][\w-]*(?=\s*:[^;{}]*(?:;|\}|$))/y, 'property'],
      [/#[\da-fA-F]{3,8}\b/y, (m, s) => (inSelector(s) ? 'type' : 'number')],
      [/[#.][A-Za-z_-][\w-]*/y, (m, s) => (inSelector(s) ? 'type' : null)],
      [/::?[A-Za-z-][\w-]*/y, (m, s) => (inSelector(s) ? 'builtin' : [['punct', m[0].replace(/[^:]/g, '')], [null, m[0].replace(/:/g, '')]])],
      [/!important\b/y, 'keyword'],
      [/--[\w-]+/y, 'type'],
      [/[\w-]+(?=\()/y, 'builtin'],
      [/-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/y, 'number'],
      [/[A-Za-z][\w-]*/y, (m, s) => (inSelector(s) ? 'keyword' : null)],
      [/[{}:;,()[\]>+~*=]/y, 'punct'],
      [SPACE, null],
    ]);
}

export function tokenize(code, lang) {
  const id = resolveLanguage(lang);
  if (id === 'plaintext') return [[null, code]];
  return (LANGS[id] || LANGS.generic)(code);
}

export function normalizeCode(code) {
  return String(code).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
}

// Each line records its leading tabs/spaces so CSS can give wrapped text a hanging indent.
// `raw` keeps the text exactly as typed (the editor's live view needs every blank line).
export function highlight(code, lang, { raw = false } = {}) {
  const source = raw ? String(code) : normalizeCode(code);
  const lines = [''];
  for (const [type, text] of tokenize(source, lang)) {
    text.split('\n').forEach((part, k) => {
      if (k) lines.push('');
      if (part) lines[lines.length - 1] += type ? `<span class="tok-${type}">${escapeHtml(part)}</span>` : escapeHtml(part);
    });
  }
  const sourceLines = source.split('\n');
  return lines
    .map((line, k) => {
      const lead = (sourceLines[k] || '').match(/^[\t ]*/)[0];
      const tabs = lead.split('\t').length - 1;
      const indent = lead ? ` style="--tabs:${tabs};--spaces:${lead.length - tabs}"` : '';
      // A blank line holds a <br> so copying the block keeps it (browsers skip empty lines when copying).
      return `<span class="line"${indent}>${line || '<br>'}</span>`;
    })
    .join('\n');
}

export function codeBlock(code, lang) {
  const id = resolveLanguage(lang);
  return `<pre data-lang="${LANGUAGES[id] || id}"><code class="language-${id}">${highlight(code, id)}</code></pre>`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return s.replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? all;
  });
}

// Re-highlights every <pre><code> in an HTML string. Idempotent: existing token spans are stripped first.
export function bakeCodeBlocks(html) {
  return html.replace(/<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g, (_, attrs, inner) => {
    const lang = (attrs.match(/\blanguage-([\w+#-]+)/) || [])[1] || 'plaintext';
    return codeBlock(decodeEntities(inner.replace(/<[^>]*>/g, '')), lang);
  });
}
