import { z } from "zod";

export const listingSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const photoSchema = z.object({
  storage_path: z.string().min(1),
  url: z.string().url(),
  caption: z.string().max(280).optional().nullable(),
  position: z.number().int().min(0).max(50).default(0),
  is_cover: z.boolean().default(false),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
});

export const bedSchema = z.object({
  type: z.enum([
    "king",
    "queen",
    "double",
    "single",
    "sofa_bed",
    "bunk",
    "crib",
    "futon",
    "floor_mattress",
  ]),
  count: z.number().int().min(1).max(10),
});

export const bedroomSchema = z.object({
  position: z.number().int().min(0).max(50),
  label: z.string().max(80).optional().nullable(),
  beds: z.array(bedSchema).default([]),
  has_ensuite: z.boolean().default(false),
});

export const houseRulesSchema = z.object({
  pets_allowed: z.boolean().default(false),
  smoking_allowed: z.boolean().default(false),
  parties_allowed: z.boolean().default(false),
  children_allowed: z.boolean().default(true),
  quiet_hours: z
    .object({
      from: z.string().regex(/^\d{2}:\d{2}$/),
      to: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional()
    .nullable(),
  additional_rules: z.string().max(4000).optional().nullable(),
});

export const checkInInfoSchema = z.object({
  check_in_from: z.string().regex(/^\d{2}:\d{2}$/).default("15:00"),
  check_in_to: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  check_out_by: z.string().regex(/^\d{2}:\d{2}$/).default("11:00"),
  self_check_in: z.boolean().default(false),
  check_in_method: z
    .enum(["smartlock", "lockbox", "keypad", "in_person", "concierge"])
    .optional()
    .nullable(),
  instructions_md: z.string().max(8000).optional().nullable(),
});

export const createPropertyBodySchema = z.object({
  property_name: z.string().trim().min(1).max(120),
  slug: listingSlugSchema.optional(),
  description: z.string().max(8000).optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
  photos_url: z.array(z.string().url()).optional(),
  list_of_amenities: z.array(z.string()).default([]),
  address: z.string().max(240).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  postal_code: z.string().max(40).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  max_guests: z.number().int().positive().optional().nullable(),
  timezone: z.string().max(60).optional().nullable(),
  beds24_property_id: z.string().max(120).optional().nullable(),
  instant_book: z.boolean().optional(),
  status: z.enum(["draft", "pending_review", "published"]).optional(),
  cancellation_policy_id: z.string().uuid().optional().nullable(),
});

export const updatePropertyBodySchema = createPropertyBodySchema
  .partial()
  .extend({
    is_active: z.boolean().optional(),
  });

export const createListingBodySchema = z.object({
  property_id: z.string().uuid(),
  slug: listingSlugSchema.optional(),
  unit_type: z.string().max(120).optional().nullable(),
  unit_amenities: z.array(z.string()).default([]),
  unit_occupancy: z.number().int().min(0).optional().nullable(),
  unit_bathrooms: z.number().min(0).optional().nullable(),
  unit_area: z.number().min(0).optional().nullable(),
  unit_description: z.string().max(8000).optional().nullable(),
  unit_kitchen_type: z.string().max(120).optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
  photos_url: z.array(z.string().url()).optional(),
  base_price_cents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  min_nights: z.number().int().min(1).max(365).default(1),
  max_nights: z.number().int().min(1).max(365).optional().nullable(),
  beds24_room_id: z.string().max(120).optional().nullable(),
  instant_book: z.boolean().default(false),
  test_payment_mode: z.boolean().default(false),
});

export const updateListingBodySchema = createListingBodySchema
  .partial()
  .extend({ is_active: z.boolean().optional() });

export const setListingAmenitiesBodySchema = z.object({
  amenity_keys: z.array(z.string()).max(200),
});

export const setListingCategoriesBodySchema = z.object({
  category_keys: z.array(z.string()).max(50),
});

export const setListingBedroomsBodySchema = z.object({
  bedrooms: z.array(bedroomSchema).max(20),
});

export const setListingPhotosBodySchema = z.object({
  photos: z.array(photoSchema).max(50),
});

export const setListingPoisBodySchema = z.object({
  pois: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        kind: z.string().max(60).optional().nullable(),
        distance_meters: z.number().int().min(0).optional().nullable(),
        position: z.number().int().min(0).max(50).default(0),
      }),
    )
    .max(50),
});
