import mongoose from 'mongoose'

// 商品三级分类：level 1/2/3，parentId 指向上级（一级分类为 null）
export interface ICategory {
  name: string
  level: 1 | 2 | 3
  parentId: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const categorySchema = new mongoose.Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, '分类名称不能为空'],
      trim: true,
      maxlength: [20, '分类名称不能超过 20 个字符'],
    },
    level: {
      type: Number,
      required: true,
      enum: [1, 2, 3],
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      // ref字段的作用是告诉Mongoose这个字段是一个引用，指向另一个集合中的文档
      ref: 'Category',
      default: null,
    },
  },
  { timestamps: true },
)

// 为保证同级分类名称唯一，建立联合索引：parentId + name
categorySchema.index({ parentId: 1, name: 1 }, { unique: true })

export const Category = mongoose.model<ICategory>('Category', categorySchema)
