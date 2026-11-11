import type { AiProfileOperation } from "../../shared/ai-chat";
import { application } from "../application/runtime";
import { confirmAction } from "../components";
import type { SaveSnapshot } from "../save-publication";

export async function applyAiProfile(operation: AiProfileOperation, { state, scope }: SaveSnapshot, chinese: boolean) {
  const profile = state.profile;
  const t = (zh: string, en: string) => chinese ? zh : en;
  if (operation.type === "read_profile") {
    const name = t(`本机昵称为「${profile.name}」。`, `Your local character name is “${profile.name}”.`);
    const age = t(`本机档案中的年龄是 ${profile.age} 岁。`, `Your local profile shows age ${profile.age}.`);
    return operation.field === "name" ? name : operation.field === "age" ? age : `${name}\n${age}`;
  }

  if (operation.name === null && operation.age === null)
    return t("请告诉我新的昵称或年龄。", "Tell me the new name or age.");
  const name = operation.name !== profile.name ? operation.name : null;
  const age = operation.age !== profile.age ? operation.age : null;
  const changes = [
    name !== null && `${t("昵称", "Name")} · ${profile.name} → ${name}`,
    age !== null && `${t("年龄", "Age")} · ${profile.age} → ${age}`,
  ].filter(Boolean);
  if (!changes.length) return t("本机档案已经是这个设置。", "Your local profile already has those values.");
  if (!await confirmAction(changes.join("\n"), t("更新本机角色资料？", "Update your local character profile?")))
    return t("已取消修改角色资料。", "Profile changes canceled.");
  const result = await application.change((save) => {
    if ((name !== null && save.profile.name !== profile.name) ||
        (age !== null && save.profile.age !== profile.age))
      throw Error(t("角色资料刚刚已更新，请重新核对。", "Your profile changed. Please review it again."));
    if (name !== null) save.profile.name = name;
    if (age !== null) save.profile.age = age;
  }, scope);
  if (result.status === "error") throw Error(result.message);
  return result.status === "success"
    ? t("已保存本机角色资料。", "I saved your local character profile.")
    : t("角色资料未保存，请重试。", "Your profile was not saved. Please try again.");
}
