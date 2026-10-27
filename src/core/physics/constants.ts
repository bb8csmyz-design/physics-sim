/**
 * 物理定数。
 *
 * 大学入試・教科書の慣例に合わせ、重力加速度は g = 9.8 m/s² を標準とする。
 * それ以外は CODATA 2018 の値（SI 定義値を含む）。
 */

/** 重力加速度 [m/s²]（入試・教科書の慣例値） */
export const G_ACCEL = 9.8;

/** 真空中の光速 [m/s]（定義値） */
export const SPEED_OF_LIGHT = 299_792_458;
/** 電気素量 [C]（定義値） */
export const ELEMENTARY_CHARGE = 1.602_176_634e-19;
/** プランク定数 [J·s]（定義値） */
export const PLANCK = 6.626_070_15e-34;
/** ボルツマン定数 [J/K]（定義値） */
export const BOLTZMANN = 1.380_649e-23;
/** アボガドロ定数 [1/mol]（定義値） */
export const AVOGADRO = 6.022_140_76e23;
/** 気体定数 [J/(mol·K)] */
export const GAS_CONSTANT = BOLTZMANN * AVOGADRO;
/** 電子の質量 [kg] */
export const ELECTRON_MASS = 9.109_383_7015e-31;
/** 陽子の質量 [kg] */
export const PROTON_MASS = 1.672_621_923_69e-27;
/** 真空の誘電率 [F/m] */
export const VACUUM_PERMITTIVITY = 8.854_187_8128e-12;
/** 真空の透磁率 [N/A²] */
export const VACUUM_PERMEABILITY = 1.256_637_062_12e-6;
/** クーロンの法則の比例定数 k = 1/(4πε₀) [N·m²/C²] */
export const COULOMB_CONSTANT = 1 / (4 * Math.PI * VACUUM_PERMITTIVITY);
/** 万有引力定数 [N·m²/kg²] */
export const GRAVITATIONAL_CONSTANT = 6.674_30e-11;
