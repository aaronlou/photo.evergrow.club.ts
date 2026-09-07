import { Schema } from "effect"

import { ActivityId } from "./activity.js"

export class ActivityNotFound extends Schema.TaggedError<ActivityNotFound>("ActivityNotFound")(
  "ActivityNotFound",
  { activityId: ActivityId },
) {}

export class InvalidActivityInput extends Schema.TaggedError<InvalidActivityInput>(
  "InvalidActivityInput",
)("InvalidActivityInput", { reason: Schema.String }) {}

export class AlreadyEnrolled extends Schema.TaggedError<AlreadyEnrolled>("AlreadyEnrolled")(
  "AlreadyEnrolled",
  { activityId: ActivityId },
) {}

export class NotEnrolled extends Schema.TaggedError<NotEnrolled>("NotEnrolled")("NotEnrolled", {
  activityId: ActivityId,
}) {}

export class SignupNotStarted extends Schema.TaggedError<SignupNotStarted>("SignupNotStarted")(
  "SignupNotStarted",
  { activityId: ActivityId },
) {}

export class SignupClosed extends Schema.TaggedError<SignupClosed>("SignupClosed")(
  "SignupClosed",
  { activityId: ActivityId },
) {}

export class ActivityFull extends Schema.TaggedError<ActivityFull>("ActivityFull")(
  "ActivityFull",
  { activityId: ActivityId },
) {}

export class ActivityEnded extends Schema.TaggedError<ActivityEnded>("ActivityEnded")(
  "ActivityEnded",
  { activityId: ActivityId },
) {}
