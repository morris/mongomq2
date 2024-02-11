import type { Document, ObjectId } from 'mongodb';

export interface WithOptionalObjectId extends Document {
  _id?: ObjectId;
}
