import type { ObjectId } from "mongodb";

export interface WithOptionalObjectId {
  _id?: ObjectId;
}
