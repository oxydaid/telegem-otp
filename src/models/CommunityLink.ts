import mongoose, { Schema, Document } from 'mongoose';

export type CommunityType = 'channel' | 'group';

export interface ICommunityLink extends Document {
    name: string;
    type: CommunityType;
    link?: string | null;
    description?: string | null;
    order: number;
    isActive: boolean;
    createdBy: number;
    createdAt: Date;
    updatedAt: Date;
}

const communityLinkSchema = new Schema<ICommunityLink>(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        type: { type: String, enum: ['channel', 'group'], required: true },
        link: { type: String, default: null },
        description: { type: String, default: null, maxlength: 250 },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        createdBy: { type: Number, required: true }
    },
    { timestamps: true }
);

communityLinkSchema.index({ type: 1, isActive: 1, order: 1, createdAt: 1 });

export const CommunityLink = mongoose.model<ICommunityLink>('CommunityLink', communityLinkSchema);