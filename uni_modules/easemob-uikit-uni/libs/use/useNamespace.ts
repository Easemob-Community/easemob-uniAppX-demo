// BEM 类名生成器：useNamespace('avatar') →
//   b()          'em-avatar'
//   e('img')     'em-avatar__img'
//   m('circle')  'em-avatar--circle'
//   is('loading') 'is-loading'
// 参照 RiceUI release_vapor 分支同名方案，纯 ts，组件内所有 class 由此生成
export function useNamespace(name: string) {
  const block = `em-${name}`

  const b = () => block
  const e = (element: string) => `${block}__${element}`
  const m = (modifier: string) => `${block}--${modifier}`
  const is = (state: string) => `is-${state}`

  return { b, e, m, is }
}
