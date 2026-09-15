import {
  Users, Package, CreditCard, Truck, Smartphone, Boxes, ShoppingCart, Mail, Bell, Shield,
  Database, Globe, Search, FileText, Warehouse, Ticket, MessageSquare, BarChart3, Server,
} from "lucide-react";

/**
 * A pictogram for a service, chosen from words in its name. Purely visual —
 * it never changes what the graph says about the service.
 */
const RULES = [
  [/customer|user|account|member|identity|auth|profile/i, Users],
  [/order|cart|basket|checkout/i, ShoppingCart],
  [/payment|billing|invoice|wallet|card/i, CreditCard],
  [/ship|deliver|courier|logistic|fulfil/i, Truck],
  [/mobile|app|bff|client|frontend/i, Smartphone],
  [/catalog|product|inventory|stock|sku/i, Package],
  [/warehouse|storage/i, Warehouse],
  [/notif|alert|push/i, Bell],
  [/mail|email|message|chat/i, MessageSquare],
  [/search|index/i, Search],
  [/report|analytic|metric|stat/i, BarChart3],
  [/doc|content|cms|article/i, FileText],
  [/ticket|support|event/i, Ticket],
  [/security|policy|permission|role/i, Shield],
  [/data|record|store|db/i, Database],
  [/gateway|proxy|edge|api$/i, Globe],
  [/mail/i, Mail],
];

export const iconFor = (service) => {
  const name = String(service?.name || "");
  const hit = RULES.find(([re]) => re.test(name));
  if (hit) return hit[1];
  return service?.isCollection ? Smartphone : service?.entities?.length ? Boxes : Server;
};
