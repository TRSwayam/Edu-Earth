import prisma from "../prisma/client.js";
import { getErrorMessage } from "../utils/utils.js";
import { Request, Response, NextFunction } from "express";
import * as PrismaClient from "@prisma/client";
import { type User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../utils/supabase.js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      supabaseUser?: SupabaseUser;
    }
  }
}

const VALID_ROLES = ["TEACHER", "PARENT", "STUDENT", "USER"] as const;

const parseRole = (value: unknown): string => {
  if (typeof value !== "string") {
    return "USER";
  }

  const normalizedValue = value.toUpperCase();

  if (VALID_ROLES.includes(normalizedValue as typeof VALID_ROLES[number])) {
    return normalizedValue;
  }

  return "USER";
};

const getAccessToken = (req: Request) => {
  const authorizationHeader = req.headers.authorization;

  if (authorizationHeader?.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length);
  }

  const accessTokenHeader = req.headers["access-token"];

  if (typeof accessTokenHeader === "string" && accessTokenHeader.length > 0) {
    return accessTokenHeader;
  }

  return null;
};

const getMetadataValue = (
  metadata: SupabaseUser["user_metadata"],
  key: string
) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const syncPrismaUser = async (supabaseUser: SupabaseUser) => {
  if (!supabaseUser.email) {
    throw new Error("Supabase user email is missing");
  }

  const fullName =
    getMetadataValue(supabaseUser.user_metadata, "full_name") ??
    getMetadataValue(supabaseUser.user_metadata, "name");
  const avatarUrl = getMetadataValue(supabaseUser.user_metadata, "avatar_url");
  const role = parseRole(supabaseUser.user_metadata?.role);

  const existingUser = await prisma.user.findUnique({
    where: { email: supabaseUser.email },
  });

  if (!existingUser) {
    return prisma.user.create({
      data: {
        email: supabaseUser.email,
        name: fullName,
        avatar: avatarUrl,
        role,
      },
    });
  }

  const updates: Record<string, any> = {};

  if (!existingUser.name && fullName) {
    updates.name = fullName;
  }

  if (!existingUser.avatar && avatarUrl) {
    updates.avatar = avatarUrl;
  }

  if (existingUser.role === "USER" && role !== "USER") {
    updates.role = role;
  }

  if (Object.keys(updates).length === 0) {
    return existingUser;
  }

  return prisma.user.update({
    where: { id: existingUser.id },
    data: updates,
  });
};

export default async function validToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const accessToken = getAccessToken(req);

    if (!accessToken) {
      throw new Error("Unauthorized request");
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user: supabaseUser },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !supabaseUser) {
      throw error ?? new Error("Invalid access token");
    }

    const user = await syncPrismaUser(supabaseUser);

    req.user = user;
    req.supabaseUser = supabaseUser;

    next();
  } catch (error) {
    return res.status(401).json({
      error: getErrorMessage(error, "Unauthorized Access"),
    });
  }
}
