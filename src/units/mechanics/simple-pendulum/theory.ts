import { eq, note, p, question, section, theory, ul } from '@/ui/theory';

export function buildTheory(): HTMLElement {
  return theory(
    section(
      '接線方向の運動方程式',
      p(
        '長さ $L$ の糸につるした質量 $m$ のおもりが、鉛直から角 $\\theta$ だけ振れているとする。張力 $T$ は糸の方向（運動の向きと垂直）なので、円弧に沿った接線方向には重力の成分 $mg\\sin\\theta$ だけがはたらく。円弧に沿った変位を $x = L\\theta$ とすると',
      ),
      eq('ma = -mg\\sin\\theta'),
    ),
    section(
      '単振動の近似と周期',
      p(
        '振れ角が小さいとき $\\sin\\theta \\approx \\theta = x/L$ と近似できるので、復元力は変位に比例する。',
      ),
      eq(
        'ma \\approx -\\frac{mg}{L}x \\quad\\Longrightarrow\\quad \\omega = \\sqrt{\\frac{g}{L}}, \\qquad T = 2\\pi\\sqrt{\\frac{L}{g}}',
      ),
      p(
        '周期は糸の長さ $L$ と重力加速度 $g$ だけで決まり、おもりの質量や振れ幅によらない（振り子の等時性）。',
      ),
    ),
    section(
      '振れ角が大きいとき',
      p(
        '振れ角が大きくなると $\\sin\\theta < \\theta$ なので、復元力は近似より小さくなり、周期は公式より長くなる。厳密な周期は第 1 種完全楕円積分 $K$ を使って',
      ),
      eq(
        'T = 4\\sqrt{\\frac{L}{g}}\\,K\\!\\left(\\sin\\frac{\\theta_0}{2}\\right) \\approx 2\\pi\\sqrt{\\frac{L}{g}}\\left(1 + \\frac{\\theta_0^{\\,2}}{16} + \\cdots\\right)',
      ),
      p(
        'と表される。$\\theta_0 = 20^\\circ$ でも差は 1% 未満だが、$90^\\circ$ では約 18% 長くなる。「単振動の近似」を表示して、振れ角を大きくすると近似のおもりと実際のおもりがずれていくことを確かめよう。',
      ),
    ),
    section(
      'エネルギーと張力',
      p('張力は仕事をしないので、力学的エネルギーが保存される。最下点の速さは'),
      eq(
        '\\frac{1}{2}mv^2 = mgL(1 - \\cos\\theta_0) \\quad\\Longrightarrow\\quad v = \\sqrt{2gL(1 - \\cos\\theta_0)}',
      ),
      p(
        '糸の方向（中心方向）の運動方程式 $mv^2/L = T - mg\\cos\\theta$ から、張力は最下点で最大になる。',
      ),
      eq('T_{\\text{最下点}} = mg(3 - 2\\cos\\theta_0), \\qquad T_{\\text{端}} = mg\\cos\\theta_0'),
    ),
    note(
      '入試のポイント',
      ul(
        '周期 $T = 2\\pi\\sqrt{L/g}$ は「振れ角が小さいとき」の近似。質量にはよらない',
        '糸の長さを 4 倍にすると周期は 2 倍。重力加速度が $1/6$ の月面では $\\sqrt{6} \\approx 2.4$ 倍',
        "エレベーターや電車の中の振り子は、見かけの重力加速度 $g'$ で $T = 2\\pi\\sqrt{L/g'}$ とする",
        '張力は一定ではない。最下点では $T > mg$（向心力の分だけ大きい）',
      ),
    ),
    section(
      '考えてみよう',
      question(
        '糸の長さ 1.0 m の単振り子の周期はいくらか。',
        p('$T = 2\\pi\\sqrt{1.0/9.8} \\approx 2.0$ s。「この条件での値」で確かめよう。'),
      ),
      question(
        '振れ角を 20° から 80° にすると、周期は公式の値から何 % ずれるか。',
        p(
          '20° では約 0.8%、80° では約 14% 長くなる。スライダーで振れ角を変え、「厳密な周期」と「公式」の差を確かめよう。',
        ),
      ),
      question(
        '$\\theta_0 = 60^\\circ$ で放したとき、最下点で糸の張力は重力の何倍か。',
        p('$T = mg(3 - 2\\cos 60^\\circ) = 2mg$ なので 2 倍。「張力」のグラフで確かめよう。'),
      ),
    ),
    section(
      '数値計算について',
      p(
        '近似せずに運動方程式 $\\ddot{\\theta} = -(g/L)\\sin\\theta$ を、刻み幅 $\\Delta t = 1$ ms の吉田の 4 次シンプレクティック法で解いている。小さい振れ角での周期の公式、大きい振れ角での楕円積分による厳密な周期との一致と、エネルギー保存を自動テストで確認している。',
      ),
    ),
  );
}
