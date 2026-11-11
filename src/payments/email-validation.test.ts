import { it, expect } from "vitest";
import { validAccountEmail, emailValidationMessage } from "./email-validation";
it.each([
  "",
  "plain",
  "person@",
  "@example.com",
  "person@example",
  "a@@example.com",
  "a b@example.com",
])("rejects invalid email with one generic message: %s", (value) => {
  expect(validAccountEmail(value)).toBe(false);
  expect(emailValidationMessage).toBe("请输入正确的邮箱地址");
});
it.each([
  "person@example.com",
  " user+test@sub.example.com ",
  "A.User@example.com",
])("accepts a valid email: %s", (value) =>
  expect(validAccountEmail(value)).toBe(true),
);
