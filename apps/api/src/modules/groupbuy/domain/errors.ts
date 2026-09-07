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

export class NotJoinedGroup extends Schema.TaggedError<NotJoinedGroup>("NotJoinedGroup")(
  "NotJoinedGroup",
  { hubId: HubId, filmId: FilmId },
) {}

export class InvalidQuantity extends Schema.TaggedError<InvalidQuantity>("InvalidQuantity")(
  "InvalidQuantity",
  { quantity: Schema.Int },
) {}

/** 商品 ID 已存在（管理端新增商品时同名 slug 冲突） */
export class FilmAlreadyExists extends Schema.TaggedError<FilmAlreadyExists>(
  "FilmAlreadyExists",
)("FilmAlreadyExists", { filmId: FilmId }) {}
