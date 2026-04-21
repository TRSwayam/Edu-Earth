import prisma from "../prisma/client.js";
import { sendResponse } from "../utils/ResponseHelpers.js";
import { getErrorMessage } from "../utils/utils.js";
import { Request, Response } from "express";
// ...existing code...

const editableFields = new Set([
  "name",
  "avatar",
  "phone",
  "dateOfBirth",
]);

const VALID_ROLES = ["TEACHER", "PARENT", "STUDENT", "USER"] as const;

const parseRole = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;

  const normalizedValue = value.toUpperCase();

  if (VALID_ROLES.includes(normalizedValue as typeof VALID_ROLES[number])) {
    return normalizedValue;
  }

  return undefined;
};

export const getUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendResponse({
        res,
        success: false,
        error: {
          message: "Unauthorized request",
        },
        statusCode: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        student: {
          select: {
            id: true,
            ecoPoints: true,
            level: true,
            streak: true,
            institution: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                badges: true,
                challengeParticipations: true,
                classes: true,
                completedLessons: true,
                quizAttempts: true,
              },
            },
          },
        },
        teacher: {
          select: {
            id: true,
            institution: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                classes: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return sendResponse({
        res,
        success: false,
        error: {
          message: "User not found",
        },
        statusCode: 404,
      });
    }

    return sendResponse({
      res,
      success: true,
      data: { user },
    });
  } catch (error) {
    return sendResponse({
      res,
      success: false,
      error: {
        message: getErrorMessage(error, "Failed to get user information"),
      },
      statusCode: 500,
    });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendResponse({
        res,
        success: false,
        error: {
          message: "Unauthorized request",
        },
        statusCode: 401,
      });
    }

    const userId = req.user.id;
    const updates = Object.entries(req.body ?? {}).reduce<Record<string, unknown>>(
      (accumulator, [key, value]) => {
        if (editableFields.has(key)) {
          accumulator[key] = value;
        }

        return accumulator;
      },
      {}
    );

    if (req.user.isAdmin || req.user.role === "USER") {
      const role = parseRole(req.body?.role);

      if (role) {
        updates.role = role;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    return sendResponse({
      res,
      success: true,
      data: { user },
      message: "User updated successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      success: false,
      error: {
        message: getErrorMessage(error, "Failed to update user information"),
      },
      statusCode: 500,
    });
  }
};
