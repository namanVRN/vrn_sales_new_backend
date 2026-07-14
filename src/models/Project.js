import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      unique: true,
      trim: true,
    },
    
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    
    description: {
      type: String,
      trim: true,
      default: '',
    },
    
    is_active: {
      type: Boolean,
      default: true,
    },
    
    // Optional: for future use
    location: {
      type: String,
      trim: true,
      default: '',
    },
    
    project_type: {
      type: String,
      enum: ['RESIDENTIAL', 'COMMERCIAL', 'PLOT', 'MIXED', ''],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.index({ name: 1 });
projectSchema.index({ is_active: 1 });

const Project = mongoose.model('Project', projectSchema);

export default Project;