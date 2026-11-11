import { z } from "zod";
export const emailValidationMessage = "请输入正确的邮箱地址";
export const validAccountEmail = (value: string) =>
  z.email().safeParse(value.trim()).success;
