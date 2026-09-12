export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          buyer_id: string | null
          cart_id: string
          created_at: string
          id: string
          last_notified_at: string | null
          recovered_at: string | null
          recovery_token: string
        }
        Insert: {
          buyer_id?: string | null
          cart_id: string
          created_at?: string
          id?: string
          last_notified_at?: string | null
          recovered_at?: string | null
          recovery_token: string
        }
        Update: {
          buyer_id?: string | null
          cart_id?: string
          created_at?: string
          id?: string
          last_notified_at?: string | null
          recovered_at?: string | null
          recovery_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_clicks: {
        Row: {
          affiliate_listing_id: string
          created_at: string
          id: string
          referrer: string | null
          visitor_id: string | null
        }
        Insert: {
          affiliate_listing_id: string
          created_at?: string
          id?: string
          referrer?: string | null
          visitor_id?: string | null
        }
        Update: {
          affiliate_listing_id?: string
          created_at?: string
          id?: string
          referrer?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_affiliate_listing_id_fkey"
            columns: ["affiliate_listing_id"]
            isOneToOne: false
            referencedRelation: "affiliate_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_conversions: {
        Row: {
          affiliate_listing_id: string
          amount: number
          commission_amount: number
          created_at: string
          id: string
          order_id: string | null
          status: string
        }
        Insert: {
          affiliate_listing_id: string
          amount?: number
          commission_amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          status?: string
        }
        Update: {
          affiliate_listing_id?: string
          amount?: number
          commission_amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_conversions_affiliate_listing_id_fkey"
            columns: ["affiliate_listing_id"]
            isOneToOne: false
            referencedRelation: "affiliate_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_listings: {
        Row: {
          affiliate_user_id: string
          commission_pct: number
          created_at: string
          custom_price: number | null
          custom_title: string | null
          id: string
          source_product_id: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          affiliate_user_id: string
          commission_pct?: number
          created_at?: string
          custom_price?: number | null
          custom_title?: string | null
          id?: string
          source_product_id: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          affiliate_user_id?: string
          commission_pct?: number
          created_at?: string
          custom_price?: number | null
          custom_title?: string | null
          id?: string
          source_product_id?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_listings_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_listings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generations: {
        Row: {
          cost_usd: number | null
          created_at: string
          id: string
          input: Json | null
          kind: string
          output: Json | null
          store_id: string | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          input?: Json | null
          kind: string
          output?: Json | null
          store_id?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          input?: Json | null
          kind?: string
          output?: Json | null
          store_id?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          dismissed: boolean
          id: string
          kind: string
          store_id: string
          title: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dismissed?: boolean
          id?: string
          kind: string
          store_id: string
          title: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dismissed?: boolean
          id?: string
          kind?: string
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_config: {
        Row: {
          fn_name: string
          model_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fn_name: string
          model_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fn_name?: string
          model_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          quantity: number
          unit_price: number
          variant_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          quantity?: number
          unit_price: number
          variant_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          quantity?: number
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          buyer_id: string | null
          created_at: string
          id: string
          session_token: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          created_at?: string
          id?: string
          session_token?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          created_at?: string
          id?: string
          session_token?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          position: number
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_syncs: {
        Row: {
          action: string
          attempts: number
          channel_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          error: string | null
          id: string
          payload: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          attempts?: number
          channel_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error?: string | null
          id?: string
          payload?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          channel_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          id?: string
          payload?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_syncs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          external_ids: Json
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          last_error: string | null
          last_synced_at: string | null
          settings: Json
          status: Database["public"]["Enums"]["channel_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_ids?: Json
          id?: string
          kind: Database["public"]["Enums"]["channel_kind"]
          last_error?: string | null
          last_synced_at?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["channel_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_ids?: Json
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          last_error?: string | null
          last_synced_at?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["channel_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          last_message_at: string
          order_id: string | null
          product_id: string | null
          seller_id: string
          store_id: string
          unread_buyer: number
          unread_seller: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          order_id?: string | null
          product_id?: string | null
          seller_id: string
          store_id: string
          unread_buyer?: number
          unread_seller?: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          order_id?: string | null
          product_id?: string | null
          seller_id?: string
          store_id?: string
          unread_buyer?: number
          unread_seller?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          created_at: string
          delivery_request_id: string
          id: string
          lat: number | null
          lng: number | null
          note: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          created_at?: string
          delivery_request_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          created_at?: string
          delivery_request_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_requests: {
        Row: {
          assigned_at: string | null
          buyer_id: string | null
          created_at: string
          delivered_at: string | null
          distance_km: number | null
          dropoff_address: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          id: string
          notes: string | null
          offered_fee: number
          order_id: string | null
          picked_up_at: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          rider_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          buyer_id?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_km?: number | null
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          id?: string
          notes?: string | null
          offered_fee?: number
          order_id?: string | null
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          rider_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          buyer_id?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_km?: number | null
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          id?: string
          notes?: string | null
          offered_fee?: number
          order_id?: string | null
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          rider_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          ends_at: string | null
          id: string
          min_subtotal: number | null
          starts_at: string | null
          store_id: string
          type: Database["public"]["Enums"]["discount_type"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          min_subtotal?: number | null
          starts_at?: string | null
          store_id: string
          type: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          min_subtotal?: number | null
          starts_at?: string | null
          store_id?: string
          type?: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          metadata: Json
          sender_id: string | null
        }
        Insert: {
          attachments?: Json
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          sender_id?: string | null
        }
        Update: {
          attachments?: Json
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          area: string | null
          city: string
          id: string
          region: string
        }
        Insert: {
          area?: string | null
          city: string
          id?: string
          region: string
        }
        Update: {
          area?: string | null
          city?: string
          id?: string
          region?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          kind: string
          message: string | null
          order_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          kind: string
          message?: string | null
          order_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          kind?: string
          message?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_title: string
          quantity: number
          sku: string | null
          total: number
          unit_price: number
          variant_id: string | null
          variant_title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_title: string
          quantity: number
          sku?: string | null
          total: number
          unit_price: number
          variant_id?: string | null
          variant_title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_title?: string
          quantity?: number
          sku?: string | null
          total?: number
          unit_price?: number
          variant_id?: string | null
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          buyer_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          discount: number
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"] | null
          payment_term: Database["public"]["Enums"]["payment_term"] | null
          id: string
          notes: string | null
          order_number: string
          shipping: number
          shipping_address: Json | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          buyer_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          discount?: number
          id?: string
          notes?: string | null
          order_number?: string
          shipping?: number
          shipping_address?: Json | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          buyer_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          discount?: number
          id?: string
          notes?: string | null
          order_number?: string
          shipping?: number
          shipping_address?: Json | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"] | null
          created_at: string
          currency: string
          id: string
          order_id: string
          provider: string
          raw_response: Json | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          channel?: Database["public"]["Enums"]["payment_channel"] | null
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          provider?: string
          raw_response?: Json | null
          reference: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          channel?: Database["public"]["Enums"]["payment_channel"] | null
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          provider?: string
          raw_response?: Json | null
          reference?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          kind: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          kind?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          kind?: string
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          compare_at_price: number | null
          created_at: string
          id: string
          inventory_qty: number
          options: Json
          position: number
          price: number
          product_id: string
          sku: string | null
          title: string | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          compare_at_price?: number | null
          created_at?: string
          id?: string
          inventory_qty?: number
          options?: Json
          position?: number
          price?: number
          product_id: string
          sku?: string | null
          title?: string | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          compare_at_price?: number | null
          created_at?: string
          id?: string
          inventory_qty?: number
          options?: Json
          position?: number
          price?: number
          product_id?: string
          sku?: string | null
          title?: string | null
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          affiliate_commission_pct: number
          allow_affiliates: boolean
          base_price: number
          category_id: string | null
          collection_id: string | null
          compare_at_price: number | null
          created_at: string
          currency: string
          description: string | null
          dimensions: Json | null
          external_url: string | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          specs: Json
          status: Database["public"]["Enums"]["product_status"]
          store_id: string
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
          weight_grams: number | null
          weight_kg: number | null
        }
        Insert: {
          affiliate_commission_pct?: number
          allow_affiliates?: boolean
          base_price?: number
          category_id?: string | null
          collection_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          dimensions?: Json | null
          external_url?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          specs?: Json
          status?: Database["public"]["Enums"]["product_status"]
          store_id: string
          tags?: string[]
          title: string
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          weight_grams?: number | null
          weight_kg?: number | null
        }
        Update: {
          affiliate_commission_pct?: number
          allow_affiliates?: boolean
          base_price?: number
          category_id?: string | null
          collection_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          dimensions?: Json | null
          external_url?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          specs?: Json
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          weight_grams?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency_pref: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency_pref?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency_pref?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          approved: boolean
          body: string | null
          buyer_id: string
          created_at: string
          id: string
          media: Json
          product_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          approved?: boolean
          body?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          media?: Json
          product_id: string
          rating: number
          updated_at?: string
        }
        Update: {
          approved?: boolean
          body?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          media?: Json
          product_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          completed_deliveries: number
          created_at: string
          current_lat: number | null
          current_lng: number | null
          id: string
          is_approved: boolean
          is_online: boolean
          license_plate: string | null
          phone: string | null
          rating: number
          updated_at: string
          user_id: string
          vehicle_type: string
        }
        Insert: {
          completed_deliveries?: number
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          id?: string
          is_approved?: boolean
          is_online?: boolean
          license_plate?: string | null
          phone?: string | null
          rating?: number
          updated_at?: string
          user_id: string
          vehicle_type?: string
        }
        Update: {
          completed_deliveries?: number
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          id?: string
          is_approved?: boolean
          is_online?: boolean
          license_plate?: string | null
          phone?: string | null
          rating?: number
          updated_at?: string
          user_id?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      shipping_rates: {
        Row: {
          created_at: string
          eta_days_max: number | null
          eta_days_min: number | null
          id: string
          name: string
          price: number
          zone_id: string
        }
        Insert: {
          created_at?: string
          eta_days_max?: number | null
          eta_days_min?: number | null
          id?: string
          name: string
          price?: number
          zone_id: string
        }
        Update: {
          created_at?: string
          eta_days_max?: number | null
          eta_days_min?: number | null
          id?: string
          name?: string
          price?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          created_at: string
          id: string
          name: string
          regions: string[]
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          regions?: string[]
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          regions?: string[]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zones_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["store_member_role"]
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["store_member_role"]
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["store_member_role"]
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          banner_url: string | null
          country: string
          created_at: string
          currency: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          paystack_public_key: string | null
          paystack_subaccount_code: string | null
          plan: Database["public"]["Enums"]["store_plan"]
          region: string | null
          city: string | null
          area: string | null
          ghana_post_gps: string | null
          whatsapp_number: string | null
          payment_terms: string[]
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tagline: string | null
          theme: Json
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          country?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          paystack_public_key?: string | null
          paystack_subaccount_code?: string | null
          plan?: Database["public"]["Enums"]["store_plan"] | null
          region?: string | null
          city?: string | null
          area?: string | null
          ghana_post_gps?: string | null
          whatsapp_number?: string | null
          payment_terms?: string[] | null
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          tagline?: string | null
          theme?: Json
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          country?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          paystack_public_key?: string | null
          paystack_subaccount_code?: string | null
          plan?: Database["public"]["Enums"]["store_plan"] | null
          region?: string | null
          city?: string | null
          area?: string | null
          ghana_post_gps?: string | null
          whatsapp_number?: string | null
          payment_terms?: string[] | null
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          tagline?: string | null
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: Record<string, never>
        Returns: {
          user_id: string
          email: string
          full_name: string | null
          roles: string[] | null
          created_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_store_member: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "buyer" | "seller" | "staff" | "admin" | "rider"
      channel_kind: "meta" | "tiktok" | "whatsapp"
      channel_status: "disconnected" | "connected" | "error"
      delivery_status:
        | "open"
        | "assigned"
        | "picked_up"
        | "delivered"
        | "cancelled"
      discount_type: "percentage" | "fixed" | "free_shipping"
      message_kind:
        | "text"
        | "image"
        | "system_order"
        | "system_delivery"
        | "ai_draft"
      fulfillment_type: "delivery" | "meet_in_person" | "visit_shop"
      payment_term: "escrow" | "pay_before_delivery" | "pay_on_delivery"
      order_status:
        | "pending"
        | "paid"
        | "fulfilled"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      payment_channel:
        | "card"
        | "mobile_money"
        | "bank"
        | "ussd"
        | "qr"
        | "other"
      payment_status: "pending" | "success" | "failed" | "refunded"
      product_status: "draft" | "active" | "archived"
      product_type: "own" | "affiliate_internal" | "affiliate_external"
      store_member_role: "owner" | "manager" | "staff"
      store_plan: "free" | "pro"
      store_status: "active" | "paused" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["buyer", "seller", "staff", "admin", "rider"],
      channel_kind: ["meta", "tiktok", "whatsapp"],
      channel_status: ["disconnected", "connected", "error"],
      delivery_status: [
        "open",
        "assigned",
        "picked_up",
        "delivered",
        "cancelled",
      ],
      discount_type: ["percentage", "fixed", "free_shipping"],
      message_kind: [
        "text",
        "image",
        "system_order",
        "system_delivery",
        "ai_draft",
      ],
      fulfillment_type: ["delivery", "meet_in_person", "visit_shop"],
      payment_term: ["escrow", "pay_before_delivery", "pay_on_delivery"],
      order_status: [
        "pending",
        "paid",
        "fulfilled",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      payment_channel: ["card", "mobile_money", "bank", "ussd", "qr", "other"],
      payment_status: ["pending", "success", "failed", "refunded"],
      product_status: ["draft", "active", "archived"],
      product_type: ["own", "affiliate_internal", "affiliate_external"],
      store_member_role: ["owner", "manager", "staff"],
      store_plan: ["free", "pro"],
      store_status: ["active", "paused", "suspended"],
    },
  },
} as const
