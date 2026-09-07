import { Schema } from "effect"

import { PhoneNumber } from "../../../shared/types.js"
import { UserId } from "./user.js"

export class UserNotFound extends Schema.TaggedError<UserNotFound>("UserNotFound")(
  "UserNotFound",
  { userId: UserId },
) {}

export class PhoneAlreadyRegistered extends Schema.TaggedError<PhoneAlreadyRegistered>(
  "PhoneAlreadyRegistered",
)("PhoneAlreadyRegistered", { phone: PhoneNumber }) {}

export class InvalidPhoneNumber extends Schema.TaggedError<InvalidPhoneNumber>(
  "InvalidPhoneNumber",
)("InvalidPhoneNumber", { phone: Schema.String }) {}
