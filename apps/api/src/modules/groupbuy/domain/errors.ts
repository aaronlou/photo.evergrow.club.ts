import { Schema } from "effect"

import { FilmId } from "./film.js"
import { HubId } from "./hub.js"

export class HubNotFound extends Schema.TaggedError<HubNotFound>("HubNotFound")(
  "HubNotFound",
  { hubId: HubId },
) {}

export class HubClosed extends Schema.TaggedError<HubClosed>("HubClosed")("HubClosed", {
  hubId: HubId,
}) {}

export class FilmNotFound extends Schema.TaggedError<FilmNotFound>("FilmNotFound")(
  "FilmNotFound",
  { filmId: FilmId },
) {}

export class AlreadyJoinedHub extends Schema.TaggedError<AlreadyJoinedHub>(
  "AlreadyJoinedHub",
)("AlreadyJoinedHub", { hubId: HubId }) {}

export class HubNotJoined extends Schema.TaggedError<HubNotJoined>("HubNotJoined")(
  "HubNotJoined",
  { hubId: HubId },
) {}

export class AlreadyJoinedGroup extends Schema.TaggedError<AlreadyJoinedGroup>(
  "AlreadyJoinedGroup",
)("AlreadyJoinedGroup", { hubId: HubId, filmId: FilmId }) {}
