import mongoose, { Schema } from 'mongoose';

interface AuthStateDoc {
  _id: string;
  value: unknown;
}

const authStateSchema = new Schema<AuthStateDoc>({
  _id: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true },
});

export const AuthState = mongoose.model<AuthStateDoc>(
  'AuthState',
  authStateSchema,
);
