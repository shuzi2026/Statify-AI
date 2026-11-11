// The deployed CN account service accepts at most 20 Unicode characters.
// Local profile names retain their separate, backwards-compatible 30-unit limit.
export const accountNicknameLimit = 20;
export function accountNickname(value: string) {
  const clean = value.trim();
  if (!clean) throw Error("请填写账号角色昵称");
  if (Array.from(clean).length > accountNicknameLimit)
    throw Error("账号角色昵称最多20个字，请先在人物资料中修改本机昵称，再绑定");
  if (/[\u0000-\u001f\u007f]/.test(clean))
    throw Error("账号角色昵称不能包含换行或控制字符");
  return clean;
}
